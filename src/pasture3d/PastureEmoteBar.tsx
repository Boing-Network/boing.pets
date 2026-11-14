import {
  EMOTE_LABELS,
  MANUAL_EMOTE_IDS,
  type ManualEmoteId,
} from "../world/lib/emotes";

export function PastureEmoteBar({
  visible,
  disabled,
  onEmote,
}: {
  visible: boolean;
  disabled?: boolean;
  onEmote: (emote: ManualEmoteId) => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="pasture-emote-bar"
      role="toolbar"
      aria-label="Character emotes"
    >
      {MANUAL_EMOTE_IDS.map((id, index) => (
        <button
          key={id}
          type="button"
          className="pasture-emote-btn"
          disabled={disabled}
          onClick={() => onEmote(id)}
        >
          <span className="pasture-emote-key">{index + 1}</span>
          <span>{EMOTE_LABELS[id]}</span>
        </button>
      ))}
    </div>
  );
}
