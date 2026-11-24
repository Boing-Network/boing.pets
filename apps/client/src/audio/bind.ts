/**
 * Connects the world to the audio engine: what the camera sees sets the
 * ambience, sim events ring cues, creatures call when selected and now and
 * then on their own. Call `initWorldAudio` once at boot.
 */
import {
  CreatureStatus,
  type EventKind,
  type WorldEventView,
} from "@boing-pets/contract";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { behaviorFor } from "../view/motion/behavior";
import { useAudioStore } from "./audioStore";
import {
  cueForEvent,
  sceneMix,
  selectEventCues,
  spatialise,
  voiceForSpecies,
  voicePitch,
  type Listener,
  type SceneInput,
} from "./design";
import { createAudioEngine, type AudioEngine } from "./engine";

/**
 * Written by the 3D view (`WorldAudioProbe`) a few times a second. Plain
 * module state, not a store: nothing renders from it.
 */
export type AudioScene = SceneInput & {
  listener: Listener;
  /** Territory under the orbit target, if any. */
  territoryId: number | null;
  /** Where each territory sits, to place its events. */
  territoryCenters: ReadonlyMap<number, { x: number; z: number }>;
};

let engine: AudioEngine | null = null;
let scene: AudioScene | null = null;

export function reportAudioScene(next: AudioScene): void {
  scene = next;
  engine?.setScene(sceneMix(next));
}

/** A creature's call, as loud and as placed as the caller says. */
export function playCreatureVoice(
  speciesId: number,
  creatureId: number,
  options: { gain?: number; pan?: number; wet?: number } = {},
): void {
  engine?.playVoice(voiceForSpecies(speciesId), {
    ...options,
    pitch: voicePitch(speciesId, creatureId),
  });
}

let preview: AudioEngine | null = null;

/**
 * Plays one species' call outside the world (the bestiary), where no
 * ambience runs. Call from a click, which is what lets the browser play it.
 */
export function previewSpeciesVoice(speciesId: number): void {
  if (engine != null) {
    playCreatureVoice(speciesId, 1);
    return;
  }
  if (preview == null) {
    preview = createAudioEngine();
    preview.setMusic(false);
    preview.setScene({
      wind: 0,
      windBright: 0,
      water: 0,
      crickets: 0,
      wildlife: 0,
    });
  }
  const audio = preview;
  audio.setVolume(useAudioStore.getState().volume);
  audio.start();
  const play = () =>
    audio.playVoice(voiceForSpecies(speciesId), {
      pitch: voicePitch(speciesId, 1),
      wet: 0.3,
    });
  // The first click has to wait for the context to wake up.
  if (audio.running()) play();
  else setTimeout(play, 200);
}

/** Milliseconds between the starts of event cues that arrive together. */
const CUE_SPACING_MS = 380;

function playEvents(events: readonly WorldEventView[]): void {
  events.forEach((event, index) => {
    const centre =
      event.territoryId == null
        ? undefined
        : scene?.territoryCenters.get(event.territoryId);
    const placed =
      scene != null && centre != null
        ? spatialise(scene.listener, centre)
        : { gain: 0.6, pan: 0 };
    setTimeout(() => {
      engine?.playCue(cueForEvent(event.kind), {
        gain: placed.gain,
        pan: placed.pan,
        // Further away: quieter and more of it is echo.
        wet: 0.35 + (1 - placed.gain) * 0.5,
      });
    }, index * CUE_SPACING_MS);
  });
}

/** Now and then a creature near the camera calls out on its own. */
function wildlifeCall(): void {
  if (engine == null || scene == null || !engine.running()) return;
  const { view, clock } = useWorldViewStore.getState();
  if (view == null || clock?.paused) return;
  const mix = sceneMix(scene);
  // About one call every five seconds when zoomed right in.
  if (Math.random() > mix.wildlife * 0.2) return;
  const here = view.creatures.filter(
    (c) =>
      c.status === CreatureStatus.ALIVE && c.territoryId === scene?.territoryId,
  );
  if (here.length === 0) return;
  const caller = here[Math.floor(Math.random() * here.length)]!;
  const behavior = behaviorFor(caller.currentGoal, caller.currentAction);
  // Sleepers stay quiet.
  if (behavior === "sleep") return;
  playCreatureVoice(caller.speciesId, caller.id, {
    gain: 0.25 + Math.random() * 0.3,
    pan: Math.random() * 1.4 - 0.7,
    wet: 0.6,
  });
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Starts the world's sound. Browsers only let audio begin after the visitor
 * interacts with the page, so the first click, tap or key press starts it.
 * Returns a cleanup function.
 */
export function initWorldAudio(): () => void {
  if (engine != null || typeof window === "undefined") return () => undefined;
  const audio = createAudioEngine();
  engine = audio;
  const prefs = useAudioStore.getState();
  audio.setVolume(prefs.volume);
  audio.setMusic(prefs.music);
  if (scene != null) audio.setScene(sceneMix(scene));

  const sync = () => {
    const wanted = useAudioStore.getState().enabled && !document.hidden;
    if (wanted) audio.start();
    else audio.stop();
  };

  const onGesture = (event: Event) => {
    sync();
    // A soft tick for buttons and links, like a pebble set down.
    const target = event.target;
    if (
      event.type === "pointerdown" &&
      target instanceof Element &&
      target.closest("button, a, summary") != null
    ) {
      audio.playTick();
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (
      event.key.toLowerCase() === "m" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTyping(event.target)
    ) {
      const state = useAudioStore.getState();
      state.setEnabled(!state.enabled);
    }
    sync();
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", sync);

  const unlockPoll = setInterval(() => {
    const unlocked = audio.running();
    if (useAudioStore.getState().unlocked !== unlocked) {
      useAudioStore.setState({ unlocked });
    }
  }, 500);

  const unsubscribePrefs = useAudioStore.subscribe((state, previous) => {
    if (state.volume !== previous.volume) audio.setVolume(state.volume);
    if (state.music !== previous.music) audio.setMusic(state.music);
    if (state.enabled !== previous.enabled) sync();
  });

  let cursor: number | null = null;
  let lastEvents: readonly WorldEventView[] | null = null;
  const unsubscribeWorld = useWorldViewStore.subscribe((state) => {
    const view = state.view;
    if (view == null || view.events === lastEvents) return;
    lastEvents = view.events;
    const next = selectEventCues(view.events, cursor, view.world.lastTick);
    cursor = next.cursor;
    if (next.play.length > 0) playEvents(next.play);
  });

  const unsubscribeUi = useUiStore.subscribe((state, previous) => {
    const id = state.selectedCreatureId;
    if (id == null || id === previous.selectedCreatureId) return;
    const creature = useWorldViewStore
      .getState()
      .view?.creatures.find((c) => c.id === id);
    if (creature != null) {
      playCreatureVoice(creature.speciesId, creature.id, { gain: 1, wet: 0.2 });
    }
  });

  const wildlifeTimer = setInterval(wildlifeCall, 1000);

  // For checks from the console and headless runs, like `__livingPetsCamera`.
  const debug = {
    running: () => audio.running(),
    level: () => audio.level(),
    scene: () => (scene == null ? null : sceneMix(scene)),
    voice: (speciesId: number) => playCreatureVoice(speciesId, 1),
    cue: (kind: EventKind) => audio.playCue(cueForEvent(kind)),
  };
  (
    window as unknown as { __livingPetsAudio?: typeof debug }
  ).__livingPetsAudio = debug;

  return () => {
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", sync);
    clearInterval(unlockPoll);
    clearInterval(wildlifeTimer);
    unsubscribePrefs();
    unsubscribeWorld();
    unsubscribeUi();
    delete (window as unknown as { __livingPetsAudio?: typeof debug })
      .__livingPetsAudio;
    audio.dispose();
    engine = null;
  };
}
