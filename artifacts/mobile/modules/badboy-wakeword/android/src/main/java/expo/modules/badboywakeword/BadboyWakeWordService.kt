package expo.modules.badboywakeword
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import androidx.core.app.NotificationCompat
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.*

class BadboyWakeWordService : Service() {
 @Volatile private var running=false
 private var audio:AudioRecord?=null
 private var model:Interpreter?=null
 private var threshold=0.696f
 private val rate=16000; private val size=16000; private val hop=1600
 private val ring=FloatArray(size); private var pos=0; private var filled=0
 private var last=0L; private var streak=0; private var ema=0.0
 private val filters=mutableListOf<Biquad>()
 override fun onCreate(){super.onCreate();getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("badboy_wake","Hey Badboy",NotificationManager.IMPORTANCE_LOW))}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  threshold=(intent?.getDoubleExtra("threshold",0.696)?:0.696).toFloat()
  val n=NotificationCompat.Builder(this,"badboy_wake").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Hey Badboy সক্রিয়").setContentText("বলুন: Hey Badboy").setOngoing(true).build()
  if(Build.VERSION.SDK_INT>=29)startForeground(7401,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(7401,n)
  Thread({detect()},"BadboyWakeWord").start();return START_NOT_STICKY
 }
 private fun modelBuffer():MappedByteBuffer{val fd=assets.openFd("wake.tflite");return FileInputStream(fd.fileDescriptor).channel.map(FileChannel.MapMode.READ_ONLY,fd.startOffset,fd.length)}
 private fun detect(){
  Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
  try{
   model=Interpreter(modelBuffer(),Interpreter.Options().setNumThreads(2))
   require(model!!.getInputTensor(0).shape().contentEquals(intArrayOf(1,40,101))){"TFLite input shape mismatch"}
   require(model!!.getOutputTensor(0).shape().contentEquals(intArrayOf(1,1))){"TFLite output shape mismatch"}
   listOf(0.5098,0.6013,0.8999,2.5629).forEach{filters.add(Biquad.hp(100.0,it,rate.toDouble()))}
   filters.add(Biquad.notch(50.0,30.0,rate.toDouble()));filters.add(Biquad.notch(60.0,30.0,rate.toDouble()))
   val min=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);require(min>0)
   val rec=AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,max(min,hop*4))
   require(rec.state==AudioRecord.STATE_INITIALIZED);audio=rec;rec.startRecording();running=true;BadboyWakeWordBridge.update("listening",true)
   val pcm=ShortArray(hop)
   while(running){val n=rec.read(pcm,0,hop,AudioRecord.READ_BLOCKING);if(n<=0)error("AudioRecord read failed: $n")
    for(i in 0 until n){var v=pcm[i]/32768f;filters.forEach{v=it.run(v)};ring[pos]=v;pos=(pos+1)%size};filled=min(size,filled+n)
    if(filled==size)infer()
   }
  }catch(e:Exception){BadboyWakeWordBridge.update("error",false,e.message?: "Wake word service failed");stopSelf()}
  finally{running=false;try{audio?.stop()}catch(_:Exception){};audio?.release();audio=null;model?.close();model=null}
 }
 private fun infer(){
  val x=FloatArray(size);var peak=0f;var energy=0.0
  for(i in 0 until size){val v=ring[(pos+i)%size];x[i]=v;peak=max(peak,abs(v));energy+=v.toDouble()*v}
  if(20*log10(sqrt(energy/size).coerceAtLeast(1e-10)) < -55 || peak<1e-5f){streak=0;return}
  val gain=min(1.0,0.707/peak).toFloat();for(i in x.indices)x[i]*=gain
  val out=arrayOf(FloatArray(1));model!!.run(arrayOf(features(x)),out)
  val p=(1/(1+exp(-out[0][0].toDouble()))).toFloat();ema=.5*p+.5*ema
  if(ema>=threshold)streak++ else streak=0
  val now=System.currentTimeMillis()
  if(streak>=2 && now-last>=700){last=now;streak=0;BadboyWakeWordBridge.update("triggered",true);BadboyWakeWordBridge.detected(ema.toFloat());running=false;stopSelf()}
 }
 private fun features(x:FloatArray):Array<FloatArray>{
  val out=Array(40){FloatArray(101)};val win=FloatArray(400){i->(.5-.5*cos(2*PI*i/399)).toFloat()};val bank=melBank()
  for(t in 0..100){val re=DoubleArray(512);val im=DoubleArray(512);val start=t*160-200
   for(i in 0..399){val at=start+i;re[i]=(if(at in x.indices)x[at].toDouble() else 0.0)*win[i].toDouble()}
   fft(re,im);val power=DoubleArray(257){k->(re[k]*re[k]+im[k]*im[k])/512}
   for(m in 0..39){var e=0.0;for(k in 0..256)e+=power[k]*bank[m][k];out[m][t]=ln(max(e,1e-10)).toFloat()}
  }
  for(m in 0..39){val mean=out[m].average().toFloat();for(t in 0..100)out[m][t]-=mean}
  return out
 }
 private fun melBank():Array<DoubleArray>{
  fun hzMel(h:Double)=2595*ln(1+h/700)/ln(10.0)
  fun melHz(m:Double)=700*(10.0.pow(m/2595)-1)
  val lo=hzMel(0.0);val hi=hzMel(8000.0);val bins=(0..41).map{floor((512+1)*melHz(lo+(hi-lo)*it/41)/rate).toInt().coerceIn(0,256)}
  return Array(40){m->DoubleArray(257){k->when{ k<bins[m]||k>bins[m+2]->0.0;k<bins[m+1]->(k-bins[m]).toDouble()/max(1,bins[m+1]-bins[m]);else->(bins[m+2]-k).toDouble()/max(1,bins[m+2]-bins[m+1])}}}
 }
 private fun fft(r:DoubleArray,v:DoubleArray){val n=r.size;var j=0
  for(i in 1 until n){var b=n shr 1;while((j and b)!=0){j=j xor b;b=b shr 1};j=j xor b;if(i<j){var z=r[i];r[i]=r[j];r[j]=z;z=v[i];v[i]=v[j];v[j]=z}}
  var len=2;while(len<=n){val a=-2*PI/len;val wr0=cos(a);val wi0=sin(a);var s=0
   while(s<n){var wr=1.0;var wi=0.0;for(k in 0 until len/2){val u=s+k;val q=u+len/2;val tr=r[q]*wr-v[q]*wi;val ti=r[q]*wi+v[q]*wr;r[q]=r[u]-tr;v[q]=v[u]-ti;r[u]+=tr;v[u]+=ti;val nw=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nw};s+=len};len=len shl 1}
 }
 override fun onDestroy(){running=false;try{audio?.stop()}catch(_:Exception){};super.onDestroy();BadboyWakeWordBridge.stopped()}
 override fun onBind(intent:Intent?):IBinder?=null
}
private class Biquad(val b0:Double,val b1:Double,val b2:Double,val a1:Double,val a2:Double){
 var x1=0.0;var x2=0.0;var y1=0.0;var y2=0.0
 fun run(f:Float):Float{val x=f.toDouble();val y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y.toFloat()}
 companion object{
  fun hp(fc:Double,q:Double,fs:Double):Biquad{val w=2*PI*fc/fs;val c=cos(w);val a=sin(w)/(2*q);val d=1+a;return Biquad((1+c)/2/d,-(1+c)/d,(1+c)/2/d,-2*c/d,(1-a)/d)}
  fun notch(fc:Double,q:Double,fs:Double):Biquad{val w=2*PI*fc/fs;val c=cos(w);val a=sin(w)/(2*q);val d=1+a;return Biquad(1/d,-2*c/d,1/d,-2*c/d,(1-a)/d)}
 }
}
