import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let selectedTheme = 'badboy';
mock.module('@/context/AssistantContext', {
  namedExports: { useAssistant: () => ({ settings: { theme: selectedTheme } }) },
});
const hookPromise = import('../../hooks/useColors');
const palettes = (await import('../../constants/colors')).default.themes;

test('useColors returns every selectable palette and shared radius', async () => {
  const { useColors } = await hookPromise;
  for (const theme of Object.keys(palettes) as Array<keyof typeof palettes>) {
    selectedTheme = theme;
    let result: ReturnType<typeof useColors> | undefined;
    function Capture() {
      result = useColors();
      return React.createElement('output', null, result.primary);
    }
    const html = renderToStaticMarkup(React.createElement(Capture));
    assert.ok(result);
    assert.equal(result.primary, palettes[theme].primary);
    assert.equal(result.background, palettes[theme].background);
    assert.equal(result.radius, 18);
    assert.match(html, new RegExp(palettes[theme].primary));
  }
});

test('useColors falls back to the neon palette for an unknown stored theme', async () => {
  const { useColors } = await hookPromise;
  selectedTheme = 'removed-theme';
  let result: ReturnType<typeof useColors> | undefined;
  function Capture() {
    result = useColors();
    return null;
  }
  renderToStaticMarkup(React.createElement(Capture));
  assert.deepEqual(result, { ...palettes.neon, radius: 18 });
});
