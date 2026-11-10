useEffect(() => {
  let active = true;
  setVoiceListLoading(true);

  // Added void operator to handle floating Promise explicitly
  void getAvailableSearchVoices()
    .then((voices) => {
      if (active) setAvailableVoices(voices);
    })
    .finally(() => {
      if (active) setVoiceListLoading(false);
    });

  void hasTelegramBot().then((connected) => {
    if (active) setTelegramConnected(connected);
  }).catch(() => {
    if (active) setTelegramError('Telegram connection verification failed');
  });

  void getGitHubToken().then((token) => {
    if (active && token) {
      setGitHubToken(token);
    }
  }).catch(() => {
    // Ignore fallback
  });

  setProjectBrain(getProjectBrainSummary());
  setQAResult(runAutoQASuite());
  setPlugins(getPluginRegistryStatus());

  // Fixed unhandled promises with void operator
  void listDeveloperTasks().then((tasks) => {
    if (active) setDeveloperTasks(tasks);
  }).catch(() => {});

  void listDeveloperProjects().then((projects) => {
    if (active) {
      setDeveloperProjects(projects);
      if (projects[0]) setSelectDeveloperProjectId((current) => current || projects[0].project_id);
    }
  }).catch(() => {});

  return () => {
    active = false;
  };
}, []);
// Add 'void' in front of un-awaited async call
void refreshDeveloperTasks();
// Expressing explicitly with void or async wrapper
onPress: () => {
  setTelegramBusy(true);
  setTelegramError(null);
  void connectTelegramBot(token)
    .then((bot) => {
      setTelegramConnected(true);
      setBotUsername(bot.username);
      setBotTokenDraft('');
    })
    .catch((cause) => setTelegramError(cause instanceof Error ? cause.message : 'Bot connect failed'))
    .finally(() => setTelegramBusy(false));
}
