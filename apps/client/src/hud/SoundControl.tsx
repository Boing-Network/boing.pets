import { useAudioStore } from "../audio/audioStore";

/**
 * Sound on/off, volume and music, in the header. Sound is on by default but
 * browsers hold it until the first click or key press; until then the button
 * says so. `M` toggles sound from anywhere outside a text field.
 */
export function SoundControl() {
  const enabled = useAudioStore((s) => s.enabled);
  const volume = useAudioStore((s) => s.volume);
  const music = useAudioStore((s) => s.music);
  const unlocked = useAudioStore((s) => s.unlocked);
  const setEnabled = useAudioStore((s) => s.setEnabled);
  const setVolume = useAudioStore((s) => s.setVolume);
  const setMusic = useAudioStore((s) => s.setMusic);

  const waiting = enabled && !unlocked;

  return (
    <div className="sound-control" role="group" aria-label="Sound">
      <button
        type="button"
        className="clock-btn"
        aria-pressed={enabled}
        title={
          waiting
            ? "Sound starts with your first click or key press (M to mute)"
            : "Turn the world's sound on or off (M)"
        }
        onClick={() => setEnabled(!enabled)}
      >
        {enabled ? "Sound on" : "Sound off"}
      </button>
      {enabled ? (
        <>
          <input
            className="sound-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Volume"
            title={`Volume ${Math.round(volume * 100)}%`}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <button
            type="button"
            className="clock-btn"
            aria-pressed={music}
            title="Turn the background music on or off (ambience and creature calls stay)"
            onClick={() => setMusic(!music)}
          >
            Music
          </button>
        </>
      ) : null}
    </div>
  );
}
