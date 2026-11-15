import { Canvas, useFrame } from "@react-three/fiber";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { PASTURE_ZONE } from "../world/config/zones";
import {
  usePlazaPresence,
  type PresenceChat,
} from "../world/hooks/usePlazaPresence";
import { ensureWorldFontConfig } from "../world/lib/configureWorldFonts";
import type { LivePose } from "../world/scene/Player";
import { PetMesh } from "../world/scene/PetMesh";
import { StarterTown } from "../world/scene/StarterTown";
import {
  obstaclesForZone,
  randomWanderTarget,
  resolveClickTarget,
  seedPose,
  stepToward,
  type Vec2,
} from "./pathing";
import {
  approachSpeed,
  desiredWalkSpeed,
  expApproachAngle,
  lerpAngle,
  retarget,
} from "./motion";
import { meadowHeight } from "./meadowHeight";
import { pasturePetY } from "./pastureGround";
import { Meadow } from "./Meadow";
import { PastureStations } from "./PastureStations";
import { YARD_KIT_PRELOAD } from "./YardKits";
import { preloadYardKits } from "./yardKitLoader";
import { PastureActivityAreas } from "./PastureActivityAreas";
import { GatherHud, PastureGatherMenu } from "./PastureGatherMenu";
import {
  gatherEnabled,
  gatherQuiet,
  type GatherStatus,
} from "../ui/gatherClient";
import {
  isActivityStationKind,
  isPastureStationKind,
  isWithinStationRadius,
  nearbyInteractStation,
  stationActionLabel,
  stationByKind,
  stationPrompt,
  type PastureStationKind,
} from "./stationInteract";
import type { WorldStation } from "../world/config/zones";
import { PasturePaths } from "./PasturePaths";
import { MeadowAtmosphere, pastureHourOverride } from "./MeadowAtmosphere";
import { PUBLIC_PASTURE_HOUR } from "./pastureDay";
import type { PasturePet } from "./types";
import type { EquippedCosmetics } from "../content/cosmetics";
import {
  shouldPromoteForChat,
  shouldSilentRejoin,
} from "../world/lib/plazaChatAuth";
import {
  PASTURE_ZOOM_DEFAULT,
  PASTURE_CAM_PITCH,
  applyPointerLook,
  cameraOccludersForZone,
  isCanvasLookTarget,
  clampZoom,
  dampFollowPoint,
  resolveFollowCamera,
  zoomBySteps,
  zoomFromWheel,
} from "./camera";
import { PASTURE_SPAWN_YAW } from "./yardFacing";
import { pasturePetLabel } from "./labels";
import {
  nearbyOcclusionPoint,
  setPastureFocus,
  setPastureLookOverride,
} from "./pastureFocus";
import { PastureAudioControls } from "./PastureAudioControls";
import { PastureHelpButton, PastureHelpOverlay } from "./PastureHelpOverlay";
import {
  applyMoveKey,
  combinedMoveStick,
  isEditableTarget,
  shortcutFromEvent,
} from "./keyboardShortcuts";
import {
  collectSceneStats,
  createFrameSampler,
  EMPTY_RENDERER_INFO,
  type FrameStatsReport,
  type RendererInfoSnapshot,
} from "./frameStats";
import {
  isImmersiveFallback,
  isPastureFullscreen,
  subscribePastureFullscreen,
  togglePastureFullscreen,
} from "./fullscreen";
import { WalkthroughCard } from "../onboarding/WalkthroughCard";
import { AdventureHudChip, useAdventureDesk } from "./AdventureHudChip";
import { DailyQuestChip, useDailyProgress } from "./DailyQuestChip";
import { PastureSessionRecap } from "./PastureSessionRecap";
import { noticeWalletError } from "../ui/appRuntime";
import { careVitalsFromPet } from "./petMood";
import { getA11ySettings } from "../ui/a11ySettings";
import { PastureMinimap } from "./PastureMinimap";
import { PastureInventory } from "./PastureInventory";
import { areaProgressForStation, formatAreaLine } from "./dailyProgress";
import { PastureTouchControls } from "./PastureTouchControls";
import { PastureEmoteBar } from "./PastureEmoteBar";
import { SocialPlayWatch } from "./SocialPlayWatch";
import {
  latestEmoteFor,
  type EmoteId,
  type ManualEmoteId,
} from "../world/lib/emotes";
import {
  pastureMobileDpr,
  readPastureTouchPrefs,
  stickMagnitude,
  STICK_DEADZONE,
} from "./mobileControls";
import {
  CITY_MAX_FRAME_DT,
  CITY_MAX_STEP_DT,
  CITY_MOVE_SPEED,
  CITY_TURN_RATE,
  nextControlYaw,
  simulateCityLocomotion,
} from "./locomotion";
import {
  releaseHeldInput,
  type ControlState,
} from "../world/hooks/usePlayerControls";
import {
  isWalkthroughVisible,
  loadWalkthrough,
} from "../onboarding/walkthrough";
import {
  armAudioUnlock,
  onAudioUnlocked,
  playFootstepSfx,
  playSfx,
  popMusicDuck,
  pushMusicDuck,
  startPastureMusic,
  stopPastureMusic,
} from "../audio";

ensureWorldFontConfig();

const PastureCraftMenu = lazy(() =>
  import("./PastureCraftMenu").then((m) => ({ default: m.PastureCraftMenu })),
);
const PastureMarketMenu = lazy(() =>
  import("./PastureMarketMenu").then((m) => ({ default: m.PastureMarketMenu })),
);
const PastureCustomizeMenu = lazy(() =>
  import("./PastureCustomizeMenu").then((m) => ({
    default: m.PastureCustomizeMenu,
  })),
);
const PastureDispatchMenu = lazy(() =>
  import("./PastureDispatchMenu").then((m) => ({
    default: m.PastureDispatchMenu,
  })),
);
const PastureActivityMenu = lazy(() =>
  import("./PastureActivityMenu").then((m) => ({
    default: m.PastureActivityMenu,
  })),
);
const PastureHomeMenu = lazy(() =>
  import("./PastureHomeMenu").then((m) => ({ default: m.PastureHomeMenu })),
);

const HINT_KEY = "boing-pets-pasture-hint-v1";

export type PastureDebug = {
  getPetCount: () => number;
  getOwnPosition: () => Vec2;
  walkTo: (x: number, z: number) => void;
  inspectOwner: (owner: string) => void;
  getPlayers: () => Array<{ id: string; x: number; z: number }>;
  getChats: () => PresenceChat[];
  getEquipped: (owner: string) => EquippedCosmetics | undefined;
  sendChat: (text: string) => boolean;
  sendCosmetics: (cosmetics?: EquippedCosmetics) => void;
  getZoom: () => number;
  setZoom: (distance: number) => void;
  zoomBy: (steps: number) => void;
  setCameraPitch: (pitch: number | null) => void;
  getCameraPitch: () => number;
  setOwnYaw: (yaw: number) => void;
  resetCamera: () => void;
  setTimeOfDay: (hours: number | null) => void;
  getTimeOfDay: () => number | null;
  getStationMenu: () => PastureStationKind | null;
  openStationMenu: (kind: PastureStationKind) => void;
  closeStationMenu: () => void;
  walkToAndOpen: (kind: PastureStationKind) => void;
  showTxFeedback: (error: unknown, retry?: () => void) => void;
  openInventory: () => void;
  getNearbyStation: () => { id: string; kind: string } | null;
  setOcclusionLook: (look: { x: number; y: number; z: number } | null) => void;
  getFrameStats: () => FrameStatsReport;
};

export type PastureAppProps = {
  pets: PasturePet[];
  owner: string | null;
  onInspect: (pet: PasturePet) => void;
  onChats?: (chats: PresenceChat[]) => void;
  onStatus?: (text: string) => void;
  handleRef?: MutableRefObject<PastureDebug | null>;
};

const WANDER_SPEED = 1.35;
const PASTURE_OBSTACLES = obstaclesForZone(PASTURE_ZONE);

function usePasturePrefs() {
  const [prefs, setPrefs] = useState(() => readPastureTouchPrefs());
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => setPrefs(readPastureTouchPrefs());
    const medias = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(max-width: 900px)"),
    ];
    for (const mq of medias) mq.addEventListener("change", update);
    return () => {
      for (const mq of medias) mq.removeEventListener("change", update);
    };
  }, []);
  return prefs;
}

function readHintOpen() {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(HINT_KEY) === "1") return false;
    // The guided tour replaces the old one-shot hint for first-time visitors.
    const tour = loadWalkthrough();
    if (isWalkthroughVisible(tour, "pasture") || !tour.completed) return false;
    return true;
  } catch {
    return true;
  }
}

function FrameInfoProbe({
  onInfo,
}: {
  onInfo: (info: RendererInfoSnapshot) => void;
}) {
  useFrame(({ gl, scene }) => {
    const info = gl.info;
    const sceneStats = collectSceneStats(scene);
    onInfo({
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      lights: sceneStats.lights,
      shadowCasters: sceneStats.shadowCasters,
      transparent: sceneStats.transparent,
    });
  });
  return null;
}

export function PastureApp({
  pets,
  owner,
  onInspect,
  onChats,
  onStatus,
  handleRef,
}: PastureAppProps) {
  const { preferPerf, reducedMotion, touchControls } = usePasturePrefs();
  const controls = useRef<ControlState>({
    forward: false,
    back: false,
    left: false,
    right: false,
    interact: false,
    stickX: 0,
    stickY: 0,
  });
  const camYawRef = useRef(0);
  const lookActiveRef = useRef(false);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const livePose = useRef<LivePose>(
    (() => {
      const pose = {
        x: PASTURE_ZONE.spawn.x,
        z: PASTURE_ZONE.spawn.z,
      };
      return {
        zone: PASTURE_ZONE.id,
        x: pose.x,
        y: pasturePetY(pose.x, pose.z),
        z: pose.z,
        yaw: PASTURE_SPAWN_YAW,
      };
    })(),
  );
  const walkTarget = useRef<Vec2 | null>(null);
  const zoomRef = useRef(PASTURE_ZOOM_DEFAULT);
  const pitchRef = useRef(PASTURE_CAM_PITCH);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameSampler = useRef(createFrameSampler());
  const frameDpr = useRef(1);
  const renderInfo = useRef<RendererInfoSnapshot>({ ...EMPTY_RENDERER_INFO });
  const [zoom, setZoom] = useState(PASTURE_ZOOM_DEFAULT);
  const [ready, setReady] = useState(false);
  const [hintOpen, setHintOpen] = useState(readHintOpen);
  const [selected, setSelected] = useState<string | null>(null);
  const [stationMenu, setStationMenu] = useState<PastureStationKind | null>(
    null,
  );
  const [quarryOn, setQuarryOn] = useState(false);
  const [gatherState, setGatherState] = useState<GatherStatus | null>(null);
  const skipStations = useMemo(
    () => (quarryOn ? undefined : new Set(["bank"])),
    [quarryOn],
  );
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [mapVisible, setMapVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [nearbyStation, setNearbyStation] = useState<WorldStation | null>(null);
  const [localEmotes, setLocalEmotes] = useState<
    Array<{ id: string; emote: EmoteId; at: number }>
  >([]);
  const stationMenuRef = useRef<PastureStationKind | null>(null);
  const pendingOpenRef = useRef<PastureStationKind | null>(null);
  const [joinNonce, setJoinNonce] = useState(0);
  const [allowPrompt, setAllowPrompt] = useState(false);
  const silentRejoin = useRef(false);
  const pendingChat = useRef<string | null>(null);
  const mine = pets.find((pet) => pet.owner === owner) || null;
  const cosmetics = mine?.cosmetics;
  const presence = usePlazaPresence(
    PASTURE_ZONE.id,
    livePose,
    true,
    allowPrompt,
    joinNonce,
    {
      allowSocialSession: true,
      cosmetics,
    },
  );

  const applyZoom = useCallback((distance: number) => {
    const next = clampZoom(distance);
    zoomRef.current = next;
    setZoom(next);
    return next;
  }, []);

  const applyPitch = useCallback((pitch: number | null) => {
    pitchRef.current = pitch == null ? PASTURE_CAM_PITCH : pitch;
    return pitchRef.current;
  }, []);

  useEffect(() => {
    preloadYardKits(YARD_KIT_PRELOAD);
  }, []);

  const dismissHint = useCallback(() => {
    setHintOpen(false);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  useEffect(() => {
    const canvas = document.getElementById("pasture-canvas");
    if (!canvas) return undefined;
    const on = !!(touchControls && mine);
    canvas.classList.toggle("is-touch-controls", on);
    return () => {
      canvas.classList.remove("is-touch-controls");
    };
  }, [touchControls, mine]);

  useEffect(() => {
    if (
      !shouldSilentRejoin({
        walletBound: presence.walletBound,
        status: presence.status,
        owner,
        alreadyAttempted: silentRejoin.current,
      })
    )
      return;
    silentRejoin.current = true;
    setAllowPrompt(false);
    setJoinNonce((n) => n + 1);
  }, [owner, presence.walletBound, presence.status]);

  useEffect(() => {
    if (!presence.walletBound || presence.status !== "live") return;
    const queued = pendingChat.current;
    if (!queued) return;
    pendingChat.current = null;
    presence.sendChat(queued);
  }, [presence.walletBound, presence.status, presence.sendChat]);

  useEffect(() => {
    onChats?.(presence.chats);
  }, [presence.chats, onChats]);

  useEffect(() => {
    if (!onStatus) return;
    if (presence.error) {
      onStatus(presence.error);
      return;
    }
    if (presence.status === "live") {
      onStatus(
        presence.walletBound
          ? `Online in The Yard · ${presence.players.length} other wanderer${presence.players.length === 1 ? "" : "s"}`
          : "Spectating The Yard — connect to walk your hatch and chat.",
      );
      return;
    }
    if (presence.status === "connecting") onStatus("Joining the pasture…");
  }, [
    presence.status,
    presence.error,
    presence.walletBound,
    presence.players.length,
    onStatus,
  ]);

  const inspect = useCallback(
    (pet: PasturePet) => {
      setSelected(pet.owner);
      onInspect(pet);
    },
    [onInspect],
  );

  const walkTo = useCallback((x: number, z: number) => {
    const target = resolveClickTarget(
      { x, z },
      PASTURE_ZONE,
      PASTURE_OBSTACLES,
    );
    walkTarget.current = retarget(walkTarget.current, target);
  }, []);

  useEffect(() => {
    let dead = false;
    void gatherEnabled().then((on) => {
      if (!dead) setQuarryOn(on);
    });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (!quarryOn || !owner) return;
    let dead = false;
    const pull = () => {
      void gatherQuiet(owner).then((next) => {
        if (!dead && next) setGatherState(next);
      });
    };
    pull();
    const tick = Math.max(2400, gatherState?.session?.tickMs ?? 4000);
    const id = window.setInterval(
      pull,
      gatherState?.session?.status === "running" ? tick : 4000,
    );
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, [
    quarryOn,
    owner,
    gatherState?.session?.status,
    gatherState?.session?.tickMs,
  ]);

  const closeStationMenu = useCallback(() => {
    stationMenuRef.current = null;
    setStationMenu(null);
    playSfx("close-station");
  }, []);

  const openStationMenu = useCallback(
    (kind: PastureStationKind) => {
      pendingOpenRef.current = null;
      stationMenuRef.current = kind;
      setStationMenu(kind);
      dismissHint();
      playSfx("open-station");
    },
    [dismissHint],
  );

  const walkToAndOpen = useCallback(
    (kind: PastureStationKind) => {
      const station = stationByKind(PASTURE_ZONE, kind);
      if (!station) return;
      const here = { x: livePose.current.x, z: livePose.current.z };
      if (isWithinStationRadius(here, station)) {
        openStationMenu(kind);
        return;
      }
      pendingOpenRef.current = kind;
      walkTo(station.position.x, station.position.z);
    },
    [openStationMenu, walkTo],
  );

  const onStationInteract = useCallback(
    (station: WorldStation) => {
      if (!isPastureStationKind(station.kind)) return;
      const here = { x: livePose.current.x, z: livePose.current.z };
      if (isWithinStationRadius(here, station)) {
        openStationMenu(station.kind);
        return;
      }
      walkTo(station.position.x, station.position.z);
    },
    [openStationMenu, walkTo],
  );

  const sendChat = useCallback(
    (text: string) => {
      if (presence.walletBound) return presence.sendChat(text);
      if (!shouldPromoteForChat({ walletBound: presence.walletBound, owner }))
        return false;
      pendingChat.current = text;
      silentRejoin.current = true;
      setAllowPrompt(true);
      setJoinNonce((n) => n + 1);
      return true;
    },
    [owner, presence.walletBound, presence.sendChat],
  );

  const resetCamera = useCallback(() => {
    applyZoom(PASTURE_ZOOM_DEFAULT);
  }, [applyZoom]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      applyZoom(
        zoomFromWheel(
          zoomRef.current,
          event.deltaY,
          event.deltaMode,
          getA11ySettings().cameraSensitivity,
        ),
      );
      dismissHint();
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let zoomStart = PASTURE_ZOOM_DEFAULT;
    const pinchDistance = () => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    };
    const onDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        pinchStart = pinchDistance();
        zoomStart = zoomRef.current;
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinchStart > 1) {
        event.preventDefault();
        applyZoom(
          zoomStart *
            Math.pow(
              pinchStart / pinchDistance(),
              getA11ySettings().cameraSensitivity,
            ),
        );
        dismissHint();
      }
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [applyZoom, dismissHint]);

  useEffect(() => {
    const canvas = canvasElRef.current;
    if (!canvas || touchControls) return undefined;
    const uiOpen = () =>
      !!stationMenuRef.current || helpOpen || settingsOpen || inventoryOpen;
    const requestLock = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!isCanvasLookTarget(event.target)) return;
      if (uiOpen()) return;
      if (document.pointerLockElement === canvas) return;
      const lock = canvas.requestPointerLock?.() as void | Promise<void>;
      void Promise.resolve(lock).catch(() => undefined);
    };
    const onMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (!event.movementX && !event.movementY) return;
      const next = applyPointerLook(
        camYawRef.current,
        pitchRef.current,
        event.movementX,
        event.movementY,
        getA11ySettings().cameraSensitivity,
      );
      camYawRef.current = next.yaw;
      pitchRef.current = next.pitch;
      lookActiveRef.current = true;
      dismissHint();
    };
    const onLockChange = () => {
      lookActiveRef.current = document.pointerLockElement === canvas;
    };
    const release = () => {
      lookActiveRef.current = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
    canvas.addEventListener("pointerdown", requestLock);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("blur", release);
    return () => {
      canvas.removeEventListener("pointerdown", requestLock);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("blur", release);
      release();
    };
  }, [
    touchControls,
    helpOpen,
    settingsOpen,
    inventoryOpen,
    dismissHint,
    ready,
  ]);

  useEffect(() => {
    if (!stationMenu && !helpOpen && !settingsOpen && !inventoryOpen) return;
    lookActiveRef.current = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
  }, [stationMenu, helpOpen, settingsOpen, inventoryOpen]);

  const sendEmote = useCallback(
    (emote: ManualEmoteId) => {
      const at = Date.now();
      if (owner) {
        setLocalEmotes((prev) => [
          ...prev.filter((row) => row.id !== owner),
          { id: owner, emote, at },
        ]);
      }
      presence.sendEmote(emote);
    },
    [owner, presence],
  );

  const interactNearby = useCallback(() => {
    if (stationMenuRef.current) return false;
    const near = nearbyInteractStation(
      { x: livePose.current.x, z: livePose.current.z },
      PASTURE_ZONE,
      skipStations,
    );
    if (near && isPastureStationKind(near.kind)) {
      openStationMenu(near.kind);
      return true;
    }
    return false;
  }, [openStationMenu, skipStations]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (applyMoveKey(controls.current, event, true)) {
        event.preventDefault();
        return;
      }
      const shortcut = shortcutFromEvent(event);
      if (shortcut) {
        if (shortcut.type === "dismiss") {
          if (document.pointerLockElement) return;
          if (helpOpen) {
            event.preventDefault();
            event.stopPropagation();
            setHelpOpen(false);
            return;
          }
          if (settingsOpen) {
            event.preventDefault();
            event.stopPropagation();
            setSettingsOpen(false);
            return;
          }
          if (inventoryOpen) {
            event.preventDefault();
            event.stopPropagation();
            setInventoryOpen(false);
            return;
          }
          if (stationMenuRef.current) {
            event.preventDefault();
            event.stopPropagation();
            closeStationMenu();
            return;
          }
          if (isImmersiveFallback()) {
            event.preventDefault();
            event.stopPropagation();
            void togglePastureFullscreen().then((active) =>
              setFullScreen(active),
            );
          }
          return;
        }
        event.preventDefault();
        if (shortcut.type === "toggleBag") {
          setHelpOpen(false);
          setInventoryOpen((open) => !open);
        } else if (shortcut.type === "toggleMap") {
          setMapVisible((open) => !open);
        } else if (shortcut.type === "toggleSettings") {
          setHelpOpen(false);
          setSettingsOpen((open) => !open);
        } else if (shortcut.type === "toggleHelp") {
          setHelpOpen((open) => !open);
        } else if (shortcut.type === "emote") {
          sendEmote(shortcut.id);
        } else if (shortcut.type === "interact") {
          interactNearby();
        } else if (shortcut.type === "toggleFullscreen") {
          void togglePastureFullscreen().then((active) =>
            setFullScreen(active),
          );
        }
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyZoom(
          zoomBySteps(
            zoomRef.current,
            -1,
            1.18,
            getA11ySettings().cameraSensitivity,
          ),
        );
        dismissHint();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        applyZoom(
          zoomBySteps(
            zoomRef.current,
            1,
            1.18,
            getA11ySettings().cameraSensitivity,
          ),
        );
        dismissHint();
      } else if (event.key === "0") {
        event.preventDefault();
        resetCamera();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (applyMoveKey(controls.current, event, false)) event.preventDefault();
    };
    const clear = () => releaseHeldInput(controls.current);
    const onFocusIn = (event: FocusEvent) => {
      if (isEditableTarget(event.target)) clear();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    const onVisibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocusIn);
      clear();
    };
  }, [
    applyZoom,
    applyPitch,
    closeStationMenu,
    dismissHint,
    helpOpen,
    interactNearby,
    inventoryOpen,
    resetCamera,
    sendEmote,
    settingsOpen,
  ]);

  useEffect(() => {
    const disarm = armAudioUnlock();
    const stop = onAudioUnlocked(() => {
      startPastureMusic();
    });
    return () => {
      disarm();
      stop();
      stopPastureMusic();
    };
  }, []);

  useEffect(() => {
    if (!stationMenu) return undefined;
    pushMusicDuck();
    return () => popMusicDuck();
  }, [stationMenu]);

  useEffect(() => {
    const sync = (active: boolean) => setFullScreen(active);
    sync(isPastureFullscreen());
    return subscribePastureFullscreen(sync);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      frameSampler.current.tick(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const debug: PastureDebug = {
      getPetCount: () =>
        Math.max(
          document.querySelectorAll(".pasture-pet-hit").length,
          Math.min(pets.length, 24),
        ),
      getOwnPosition: () => ({ x: livePose.current.x, z: livePose.current.z }),
      walkTo,
      inspectOwner: (id) => {
        const pet = pets.find((item) => item.owner === id);
        if (pet) inspect(pet);
      },
      getPlayers: () =>
        presence.players.map((p) => ({ id: p.id, x: p.x, z: p.z })),
      getChats: () => presence.chats,
      getEquipped: (id) =>
        id === owner
          ? cosmetics
          : pets.find((item) => item.owner === id)?.cosmetics ||
            presence.players.find((p) => p.id === id)?.cosmetics,
      sendChat,
      sendCosmetics: presence.sendCosmetics,
      getZoom: () => zoomRef.current,
      setZoom: (distance) => applyZoom(distance),
      setCameraPitch: (pitch) => applyPitch(pitch),
      getCameraPitch: () => pitchRef.current,
      setOwnYaw: (yaw) => {
        livePose.current = { ...livePose.current, yaw };
      },
      zoomBy: (steps) =>
        applyZoom(
          zoomBySteps(
            zoomRef.current,
            steps,
            1.18,
            getA11ySettings().cameraSensitivity,
          ),
        ),
      resetCamera,
      setOcclusionLook: (look) => setPastureLookOverride(look),
      setTimeOfDay: (hours) => {
        pastureHourOverride.current = hours;
      },
      getTimeOfDay: () => pastureHourOverride.current ?? PUBLIC_PASTURE_HOUR,
      getStationMenu: () => stationMenuRef.current,
      openStationMenu,
      closeStationMenu,
      walkToAndOpen,
      showTxFeedback: noticeWalletError,
      openInventory: () => setInventoryOpen(true),
      getNearbyStation: () => {
        const near = nearbyInteractStation(
          { x: livePose.current.x, z: livePose.current.z },
          PASTURE_ZONE,
          skipStations,
        );
        return near ? { id: near.id, kind: near.kind } : null;
      },
      getFrameStats: () => ({
        ...frameSampler.current.summary(),
        ...renderInfo.current,
        dpr: frameDpr.current,
        preferPerf,
      }),
    };
    if (handleRef) handleRef.current = debug;
    if (typeof window !== "undefined") window.__pasture3d = debug;
    return () => {
      if (handleRef) handleRef.current = null;
      if (typeof window !== "undefined" && window.__pasture3d === debug)
        delete window.__pasture3d;
    };
  }, [
    pets,
    owner,
    cosmetics,
    presence.players,
    presence.chats,
    sendChat,
    presence.sendCosmetics,
    inspect,
    walkTo,
    handleRef,
    applyZoom,
    resetCamera,
    openStationMenu,
    closeStationMenu,
    walkToAndOpen,
    preferPerf,
    skipStations,
  ]);

  useEffect(() => {
    const canvas = document.getElementById("pasture-canvas");
    canvas?.classList.toggle("is-station-menu-open", !!stationMenu);
    return () => {
      canvas?.classList.remove("is-station-menu-open");
    };
  }, [stationMenu]);

  const dailyProgress = useDailyProgress(owner);
  const adventureDesk = useAdventureDesk(!!ready);
  const nearbyProgress = nearbyStation
    ? areaProgressForStation(dailyProgress, nearbyStation.kind)
    : null;

  return (
    <div
      className={
        "pasture-3d-stage" +
        (stationMenu ? " is-station-menu-open" : "") +
        (inventoryOpen ? " is-inventory-open" : "") +
        (settingsOpen ? " is-settings-open" : "") +
        (helpOpen ? " is-help-open" : "") +
        (fullScreen ? " is-fullscreen" : "") +
        (recapOpen ? " is-recap-open" : "") +
        (touchControls && mine ? " is-touch-controls" : "")
      }
      ref={stageRef}
    >
      {!ready ? (
        <div className="pasture-loading" role="status">
          Growing the meadow…
        </div>
      ) : null}
      <PastureSessionRecap owner={owner} onOpenChange={setRecapOpen} />
      <DailyQuestChip progress={dailyProgress} nearby={nearbyProgress} />
      <AdventureHudChip
        desk={adventureDesk}
        hidden={!!stationMenu}
        onOpen={() => openStationMenu("dispatch")}
      />
      <PastureHelpOverlay
        open={helpOpen}
        touch={touchControls}
        onClose={() => setHelpOpen(false)}
      />
      <PastureMinimap
        poseRef={livePose}
        visible={mapVisible}
        onToggle={() => setMapVisible((open) => !open)}
        onWalk={(x, z) => walkTo(x, z)}
      />
      <PastureInventory
        owner={owner}
        open={inventoryOpen}
        onToggle={() => setInventoryOpen((open) => !open)}
        onUseArea={(area) => {
          setInventoryOpen(false);
          walkToAndOpen(area);
        }}
      />
      <WalkthroughCard
        scene="pasture"
        openMenuKind={stationMenu}
        onGuideTo={(step) => {
          if (step === "visit-area") walkToAndOpen("mine");
          else if (step === "visit-station") walkToAndOpen("craft");
          else if (step === "pet-care") {
            document.getElementById("buddy-chip")?.click();
          }
        }}
      />
      <PastureTouchControls
        visible={touchControls && !!mine && !stationMenu}
        controls={controls}
        canInteract={!!nearbyStation}
        onInteract={() => {
          if (nearbyStation && isPastureStationKind(nearbyStation.kind))
            openStationMenu(nearbyStation.kind);
        }}
      />
      <PastureEmoteBar
        visible={!!mine && !stationMenu}
        disabled={!presence.walletBound || presence.status !== "live"}
        onEmote={sendEmote}
      />
      {hintOpen ? (
        <div className="pasture-hint" role="status">
          <p>
            WASD or the arrow keys move your character, relative to the camera.
            Click the view to look around with the mouse, and press Esc to
            release the cursor. You can also click the street to walk, or use
            the joystick. Press Enter to chat. Walk ahead and right to The Drop,
            then along the east avenue to the Print Shop or Fitting Room. Use +
            / - or the buttons to zoom, and 0 to reset.
          </p>
          <button type="button" className="quiet" onClick={dismissHint}>
            Got it
          </button>
        </div>
      ) : null}
      <div className="pasture-cam-controls" role="group" aria-label="Camera">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => {
            applyZoom(
              zoomBySteps(
                zoomRef.current,
                -1,
                1.18,
                getA11ySettings().cameraSensitivity,
              ),
            );
            dismissHint();
            playSfx("ui-click");
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => {
            applyZoom(
              zoomBySteps(
                zoomRef.current,
                1,
                1.18,
                getA11ySettings().cameraSensitivity,
              ),
            );
            dismissHint();
            playSfx("ui-click");
          }}
        >
          -
        </button>
        <button type="button" aria-label="Reset camera" onClick={resetCamera}>
          Reset
        </button>
        <PastureAudioControls
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
        <PastureHelpButton
          open={helpOpen}
          onToggle={() => setHelpOpen((open) => !open)}
        />
        <button
          type="button"
          className={fullScreen ? "is-open" : undefined}
          aria-label={fullScreen ? "Exit full screen" : "Enter full screen"}
          aria-pressed={fullScreen}
          onClick={() => {
            playSfx("ui-click");
            void togglePastureFullscreen().then((active) =>
              setFullScreen(active),
            );
          }}
        >
          {fullScreen ? "Exit" : "Full"}
        </button>
      </div>
      {quarryOn ? (
        <GatherHud
          status={gatherState}
          onOpenPack={() => openStationMenu("bank")}
        />
      ) : null}
      {nearbyStation && !stationMenu ? (
        <div className="pasture-station-prompt" role="status">
          <p className="pasture-station-prompt-copy">
            <kbd className="keycap" aria-hidden="true">
              E
            </kbd>
            <span>
              {quarryOn && nearbyStation.kind === "mine"
                ? "Press E to work the face."
                : stationPrompt(nearbyStation)}
            </span>
          </p>
          {nearbyProgress ? (
            <p className="pasture-station-progress">
              {formatAreaLine(nearbyProgress)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (isPastureStationKind(nearbyStation.kind))
                openStationMenu(nearbyStation.kind);
            }}
          >
            {quarryOn && nearbyStation.kind === "mine"
              ? "Work the face"
              : stationActionLabel(nearbyStation)}
          </button>
        </div>
      ) : null}
      {stationMenu ? (
        <div className="pasture-station-overlay">
          <Suspense
            fallback={
              <p className="small pasture-station-loading" role="status">
                Opening...
              </p>
            }
          >
            {stationMenu === "craft" ? (
              <PastureCraftMenu onClose={closeStationMenu} />
            ) : stationMenu === "market" ? (
              <PastureMarketMenu onClose={closeStationMenu} />
            ) : stationMenu === "customize" ? (
              <PastureCustomizeMenu onClose={closeStationMenu} />
            ) : stationMenu === "dispatch" ? (
              <PastureDispatchMenu
                onClose={closeStationMenu}
                desk={adventureDesk}
                onDesk={() => undefined}
              />
            ) : stationMenu === "bank" ? (
              <PastureGatherMenu
                mode="bank"
                onClose={closeStationMenu}
                onStatus={setGatherState}
              />
            ) : stationMenu === "mine" && quarryOn ? (
              <PastureGatherMenu
                mode="quarry"
                onClose={closeStationMenu}
                onStatus={setGatherState}
              />
            ) : isActivityStationKind(stationMenu) ? (
              <PastureActivityMenu
                key={stationMenu}
                kind={stationMenu}
                onClose={closeStationMenu}
              />
            ) : stationMenu === "home" ? (
              <PastureHomeMenu onClose={closeStationMenu} />
            ) : null}
          </Suspense>
        </div>
      ) : null}
      <div className="pasture-3d-canvas">
        <Canvas
          shadows={!preferPerf}
          dpr={pastureMobileDpr(preferPerf)}
          camera={{ position: [0, 11, 16], fov: 46, near: 0.1, far: 420 }}
          gl={{
            antialias: !preferPerf,
            powerPreference: preferPerf ? "low-power" : "high-performance",
            alpha: false,
          }}
          onCreated={({ gl }) => {
            canvasElRef.current = gl.domElement;
            gl.domElement.dataset.pastureCanvas = "1";
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.18;
            gl.shadowMap.enabled = !preferPerf;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            frameDpr.current = gl.getPixelRatio();
            setReady(true);
          }}

          onPointerDown={dismissHint}
        >
          <Suspense fallback={null}>
            <FrameInfoProbe
              onInfo={(info) => {
                renderInfo.current = info;
              }}
            />
            <MeadowAtmosphere
              preferPerf={preferPerf}
              reducedMotion={reducedMotion}
              followRef={livePose}
            />
            <Meadow
              preferPerf={preferPerf}
              onWalk={walkTo}
              walkEnabled={!!mine && !stationMenu}
            />
            <PastureStations
              preferPerf={preferPerf}
              onInteract={onStationInteract}
            />
            <PastureActivityAreas
              preferPerf={preferPerf}
              onInteract={onStationInteract}
              showVault={quarryOn}
            />
            <StationProximity
              poseRef={livePose}
              pendingOpenRef={pendingOpenRef}
              onNearby={setNearbyStation}
              onArrive={openStationMenu}
              skipKinds={skipStations}
            />
            <PasturePaths preferPerf={preferPerf} />
            <StarterTown
              zone={PASTURE_ZONE}
              hideGround
              hideTrees
              hidePaths
              hudSafeLabels
              heightAt={meadowHeight}
            />
            <SocialPlayWatch
              enabled={
                !!mine &&
                presence.walletBound &&
                presence.status === "live" &&
                !stationMenu
              }
              selfId={owner || ""}
              livePose={livePose}
              others={presence.players.map((player) => ({
                id: player.id,
                x: player.x,
                z: player.z,
              }))}
              onPlay={(peerId) => {
                const at = Date.now();
                const rows = [{ id: peerId, emote: "play" as const, at }];
                if (owner) rows.push({ id: owner, emote: "play", at });
                setLocalEmotes((prev) => {
                  const skip = new Set(rows.map((row) => row.id));
                  return [...prev.filter((row) => !skip.has(row.id)), ...rows];
                });
                presence.sendEmote("play");
              }}
            />
            <PastureWorld
              pets={pets}
              owner={owner}
              mine={mine}
              selected={selected}
              livePose={livePose}
              walkTarget={walkTarget}
              zoomRef={zoomRef}
              pitchRef={pitchRef}
              presencePlayers={presence.players}
              chats={presence.chats}
              emotes={[...presence.emotes, ...localEmotes]}
              preferPerf={preferPerf}
              reducedMotion={reducedMotion}
              followOwner={!!mine}
              hideHudOverlays={!!stationMenu}
              camYawRef={camYawRef}
              lookActiveRef={lookActiveRef}
              controls={controls}
              stickEnabled={!!mine && !stationMenu}
              onInspect={inspect}
            />
          </Suspense>
        </Canvas>
      </div>
      <span className="visually-hidden" aria-live="polite">
        Zoom {zoom.toFixed(1)}
      </span>
    </div>
  );
}

function PastureWorld({
  pets,
  owner,
  mine,
  selected,
  livePose,
  walkTarget,
  zoomRef,
  pitchRef,
  presencePlayers,
  chats,
  emotes,
  preferPerf,
  reducedMotion,
  followOwner,
  hideHudOverlays,
  camYawRef,
  lookActiveRef,
  controls,
  stickEnabled,
  onInspect,
}: {
  pets: PasturePet[];
  owner: string | null;
  mine: PasturePet | null;
  selected: string | null;
  livePose: MutableRefObject<LivePose>;
  walkTarget: MutableRefObject<Vec2 | null>;
  zoomRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  presencePlayers: Array<{
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    z: number;
    cosmetics?: EquippedCosmetics;
  }>;
  chats: PresenceChat[];
  emotes: Array<{ id: string; emote: EmoteId; at: number }>;
  preferPerf: boolean;
  reducedMotion: boolean;
  followOwner: boolean;
  hideHudOverlays: boolean;
  camYawRef: MutableRefObject<number>;
  lookActiveRef: MutableRefObject<boolean>;
  controls: MutableRefObject<ControlState>;
  stickEnabled: boolean;
  onInspect: (pet: PasturePet) => void;
}) {
  const obstacles = PASTURE_OBSTACLES;
  const cap = preferPerf ? 16 : 24;
  const liveIds = useMemo(() => {
    const ids = new Set(presencePlayers.map((p) => p.id));
    if (mine) ids.add(mine.owner);
    return ids;
  }, [presencePlayers, mine]);

  const offline = useMemo(() => {
    const list = pets.filter((pet) => !liveIds.has(pet.owner));
    return list.slice(0, Math.max(0, cap - 1 - presencePlayers.length));
  }, [pets, liveIds, cap, presencePlayers.length]);

  const bubbleById = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, string>();
    for (const chat of chats) {
      if (now - chat.at < 6000) map.set(chat.id, chat.text);
    }
    return map;
  }, [chats]);

  const lookFor = (id: string, fallbackName: string): PasturePet => {
    const found = pets.find((pet) => pet.owner === id);
    if (found) return found;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return {
      owner: id,
      traits: {
        species: fallbackName || "Buddy",
        hue: h % 360,
        accent: (h >>> 8) % 360,
        antenna: h % 2,
        spots: h % 3,
        shape: 0,
      },
    };
  };

  return (
    <group>
      <FollowCamera
        livePose={livePose}
        zoomRef={zoomRef}
        pitchRef={pitchRef}
        reducedMotion={reducedMotion}
        followOwner={followOwner}
        camYawRef={camYawRef}
      />
      {mine ? (
        <LocalPet
          pet={mine}
          livePose={livePose}
          walkTarget={walkTarget}
          obstacles={obstacles}
          reducedMotion={reducedMotion}
          selected={selected === mine.owner}
          bubble={bubbleById.get(mine.owner)}
          hideHudOverlays={hideHudOverlays}
          camYawRef={camYawRef}
          lookActiveRef={lookActiveRef}
          controls={controls}
          stickEnabled={stickEnabled}
          emote={latestEmoteFor(emotes, mine.owner)}
          onInspect={() => onInspect(mine)}
        />
      ) : null}
      {presencePlayers.map((player) => {
        if (mine && player.id === mine.owner) return null;
        const pet = lookFor(player.id, player.name);
        return (
          <RemotePet
            key={player.id}
            pet={pet}
            player={player}
            owner={owner}
            selected={selected === player.id}
            reducedMotion={reducedMotion}
            bubble={bubbleById.get(player.id)}
            hideHudOverlays={hideHudOverlays}
            emote={latestEmoteFor(emotes, player.id)}
            onInspect={() =>
              onInspect({
                ...pet,
                cosmetics: player.cosmetics || pet.cosmetics,
              })
            }
          />
        );
      })}
      {offline.map((pet, index) => (
        <WanderingPet
          key={pet.owner}
          pet={pet}
          index={index}
          obstacles={obstacles}
          reducedMotion={reducedMotion}
          selected={selected === pet.owner}
          bubble={bubbleById.get(pet.owner)}
          preferPerf={preferPerf}
          hideHudOverlays={hideHudOverlays}
          emote={latestEmoteFor(emotes, pet.owner)}
          onInspect={() => onInspect(pet)}
        />
      ))}
    </group>
  );
}

function FollowCamera({
  livePose,
  zoomRef,
  pitchRef,
  reducedMotion,
  followOwner,
  camYawRef,
}: {
  livePose: MutableRefObject<LivePose>;
  zoomRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  reducedMotion: boolean;
  followOwner: boolean;
  camYawRef: MutableRefObject<number>;
}) {
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lookSmooth = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const boxes = useMemo(() => cameraOccludersForZone(PASTURE_ZONE), []);
  const started = useRef(false);
  const followStarted = useRef(false);
  const camVel = useRef({ x: 0, y: 0, z: 0 });
  const lookVel = useRef({ x: 0, y: 0, z: 0 });

  useFrame((state, delta) => {
    const pose = followOwner
      ? livePose.current
      : {
          x: PASTURE_ZONE.spawn.x,
          y: 0,
          z: PASTURE_ZONE.spawn.z,
          yaw: PASTURE_SPAWN_YAW,
        };
    const ground = meadowHeight(pose.x, pose.z);
    const fromSpawn = Math.hypot(
      pose.x - PASTURE_ZONE.spawn.x,
      pose.z - PASTURE_ZONE.spawn.z,
    );
    if (followOwner && fromSpawn > 0.6) followStarted.current = true;
    // Yaw is owned by locomotion. Chasing the body from here rotates the
    // camera-relative input and makes a held direction run in a circle.
    const dt = Math.min(Math.max(delta, 0), 0.1);
    const ahead = followStarted.current
      ? Math.min(1.6, zoomRef.current * 0.08)
      : 0;
    const forwardX = -Math.sin(camYawRef.current);
    const forwardZ = -Math.cos(camYawRef.current);
    const look = {
      x: pose.x + forwardX * ahead,
      y: ground + 1.25,
      z: pose.z + forwardZ * ahead,
    };
    const cam = resolveFollowCamera(
      look,
      zoomRef.current,
      meadowHeight,
      boxes,
      camYawRef.current,
      pitchRef.current,
    );
    camTarget.set(cam.x, cam.y, cam.z);
    lookTarget.set(look.x, look.y, look.z);
    if (!started.current || reducedMotion) {
      state.camera.position.copy(camTarget);
      lookSmooth.copy(lookTarget);
      camVel.current = { x: 0, y: 0, z: 0 };
      lookVel.current = { x: 0, y: 0, z: 0 };
      started.current = true;
    } else {
      const nextCam = dampFollowPoint(
        {
          x: state.camera.position.x,
          y: state.camera.position.y,
          z: state.camera.position.z,
        },
        camVel.current,
        { x: camTarget.x, y: camTarget.y, z: camTarget.z },
        dt,
      );
      camVel.current = nextCam.velocity;
      state.camera.position.set(
        nextCam.position.x,
        nextCam.position.y,
        nextCam.position.z,
      );
      const nextLook = dampFollowPoint(
        { x: lookSmooth.x, y: lookSmooth.y, z: lookSmooth.z },
        lookVel.current,
        { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z },
        dt,
      );
      lookVel.current = nextLook.velocity;
      lookSmooth.set(
        nextLook.position.x,
        nextLook.position.y,
        nextLook.position.z,
      );
    }
    state.camera.lookAt(lookSmooth);
    setPastureFocus({
      camera: {
        x: state.camera.position.x,
        y: state.camera.position.y,
        z: state.camera.position.z,
      },
      look,
      pet: followOwner ? { x: pose.x, y: ground + 0.45, z: pose.z } : null,
      nearby: nearbyOcclusionPoint({ x: pose.x, z: pose.z }),
    });
  });
  return null;
}

function LocalPet({
  pet,
  livePose,
  walkTarget,
  obstacles,
  reducedMotion,
  selected,
  bubble,
  hideHudOverlays,
  camYawRef,
  lookActiveRef,
  controls,
  stickEnabled,
  emote,
  onInspect,
}: {
  pet: PasturePet;
  livePose: MutableRefObject<LivePose>;
  walkTarget: MutableRefObject<Vec2 | null>;
  obstacles: ReturnType<typeof obstaclesForZone>;
  reducedMotion: boolean;
  selected: boolean;
  bubble?: string;
  hideHudOverlays?: boolean;
  camYawRef: MutableRefObject<number>;
  lookActiveRef: MutableRefObject<boolean>;
  controls: MutableRefObject<ControlState>;
  stickEnabled: boolean;
  emote?: { id: EmoteId; at: number } | null;
  onInspect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const moving = useRef(false);
  const started = useRef(false);
  const yaw = useRef(PASTURE_SPAWN_YAW);
  const speed = useRef(0);
  const vel = useRef({ x: 0, z: 0 });

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (!started.current) {
      const y0 = pasturePetY(livePose.current.x, livePose.current.z);
      node.position.set(livePose.current.x, y0, livePose.current.z);
      node.rotation.y = yaw.current;
      started.current = true;
    }
    const here = { x: node.position.x, z: node.position.z };
    const move = combinedMoveStick(
      controls.current,
      controls.current.stickX,
      controls.current.stickY,
    );
    const stickLen = stickMagnitude(move.x, move.y);
    const stickActive = stickEnabled && stickLen > STICK_DEADZONE;
    const target = stickActive ? null : walkTarget.current;
    if (stickActive) walkTarget.current = null;
    const coasting =
      stickEnabled &&
      !target &&
      Math.hypot(vel.current.x, vel.current.z) > 0.05;

    if (stickEnabled && !target && (stickActive || coasting)) {
      const step = simulateCityLocomotion(
        {
          x: here.x,
          z: here.z,
          yaw: yaw.current,
          vx: vel.current.x,
          vz: vel.current.z,
          camYaw: camYawRef.current,
        },
        stickActive ? move.x : 0,
        stickActive ? move.y : 0,
        delta,
        PASTURE_ZONE,
        obstacles,
        { reducedMotion, lockCamera: lookActiveRef.current },
      );
      node.position.x = step.x;
      node.position.z = step.z;
      yaw.current = step.yaw;
      node.rotation.y = yaw.current;
      vel.current = { x: step.vx, z: step.vz };
      speed.current = step.speed;
      camYawRef.current = step.camYaw;
      moving.current = step.moving;
      if (step.moving) playFootstepSfx();
    } else if (target) {
      vel.current = { x: 0, z: 0 };
      let remaining = Math.min(Math.max(delta, 0), CITY_MAX_FRAME_DT);
      let pos = here;
      let arrived = false;
      moving.current = false;
      while (remaining > 1e-6 && !arrived) {
        const dt = Math.min(CITY_MAX_STEP_DT, remaining);
        const dist = Math.hypot(target.x - pos.x, target.z - pos.z);
        const desired = desiredWalkSpeed(dist, CITY_MOVE_SPEED);
        speed.current = approachSpeed(speed.current, desired, dt);
        const stepped = stepToward(
          pos,
          target,
          dt,
          Math.max(speed.current, dist < 0.08 ? 0 : 0.35),
          PASTURE_ZONE,
          obstacles,
        );
        pos = stepped.pos;
        if (stepped.yaw !== null) {
          yaw.current = reducedMotion
            ? stepped.yaw
            : expApproachAngle(yaw.current, stepped.yaw, CITY_TURN_RATE, dt);
          node.rotation.y = yaw.current;
        }
        arrived = stepped.arrived;
        moving.current = !arrived;
        remaining -= dt;
      }
      node.position.x = pos.x;
      node.position.z = pos.z;
      if (moving.current) playFootstepSfx();
      camYawRef.current = nextControlYaw(
        camYawRef.current,
        yaw.current,
        lookActiveRef.current,
        Math.min(Math.max(delta, 0), CITY_MAX_FRAME_DT),
        reducedMotion,
      );
      if (arrived) {
        walkTarget.current = null;
        speed.current = 0;
      }
    } else {
      vel.current = { x: 0, z: 0 };
      moving.current = false;
      speed.current = approachSpeed(
        speed.current,
        0,
        Math.min(Math.max(delta, 0), CITY_MAX_STEP_DT),
      );
      // Honor debug setOwnYaw while standing still.
      const nextYaw = livePose.current.yaw;
      if (nextYaw !== undefined && nextYaw !== yaw.current) {
        yaw.current = nextYaw;
        node.rotation.y = yaw.current;
      }
      camYawRef.current = nextControlYaw(
        camYawRef.current,
        yaw.current,
        lookActiveRef.current,
        Math.min(Math.max(delta, 0), CITY_MAX_FRAME_DT),
        reducedMotion,
      );
    }
    node.position.y = pasturePetY(node.position.x, node.position.z);
    livePose.current = {
      zone: PASTURE_ZONE.id,
      x: node.position.x,
      y: node.position.y,
      z: node.position.z,
      yaw: yaw.current,
    };
  });

  const label = pasturePetLabel({ species: pet.traits.species });

  return (
    <group
      ref={group}
      position={[
        livePose.current.x,
        pasturePetY(livePose.current.x, livePose.current.z),
        livePose.current.z,
      ]}
      rotation={[0, PASTURE_SPAWN_YAW, 0]}
      userData={{ pasturePet: pet.owner }}
    >
      <PetMesh
        look={pet.traits}
        name={label}
        cosmetics={pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        yours
        movingRef={moving}
        speedRef={speed}
        bubble={bubble}
        hideHudOverlays={hideHudOverlays}
        emote={emote}
        care={careVitalsFromPet(pet)}
        moodId={pet.owner}
        onClick={onInspect}
      />
    </group>
  );
}

function WanderingPet({
  pet,
  index,
  obstacles,
  reducedMotion,
  selected,
  bubble,
  preferPerf,
  hideHudOverlays,
  emote,
  onInspect,
}: {
  pet: PasturePet;
  index: number;
  obstacles: ReturnType<typeof obstaclesForZone>;
  reducedMotion: boolean;
  selected: boolean;
  bubble?: string;
  preferPerf: boolean;
  hideHudOverlays?: boolean;
  emote?: { id: EmoteId; at: number } | null;
  onInspect: () => void;
}) {
  const spawn = useMemo(
    () => seedPose(pet.owner, index, PASTURE_ZONE, obstacles),
    [pet.owner, index, obstacles],
  );
  const group = useRef<THREE.Group>(null);
  const target = useRef<Vec2>(spawn);
  const nextPick = useRef(0);
  const moving = useRef(false);
  const lod = preferPerf || index > 8;

  useFrame((state, delta) => {
    const node = group.current;
    if (!node) return;
    if (reducedMotion) return;
    const now = state.clock.elapsedTime;
    if (now >= nextPick.current) {
      target.current = randomWanderTarget(
        (Math.floor(now * 10) + index * 17) >>> 0,
        PASTURE_ZONE,
        obstacles,
      );
      nextPick.current = now + 3.5 + (index % 5) * 0.7;
    }
    const stepped = stepToward(
      { x: node.position.x, z: node.position.z },
      target.current,
      delta,
      WANDER_SPEED,
      PASTURE_ZONE,
      obstacles,
    );
    node.position.x = stepped.pos.x;
    node.position.z = stepped.pos.z;
    node.position.y = pasturePetY(node.position.x, node.position.z);
    if (stepped.yaw !== null) {
      node.rotation.y = lerpAngle(
        node.rotation.y,
        stepped.yaw,
        1 - Math.pow(0.002, delta),
      );
    }
    moving.current = !stepped.arrived;
  });

  return (
    <group
      ref={group}
      position={[spawn.x, pasturePetY(spawn.x, spawn.z), spawn.z]}
    >
      <PetMesh
        look={pet.traits}
        name={pasturePetLabel({ species: pet.traits.species })}
        cosmetics={lod ? undefined : pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        movingRef={moving}
        bubble={bubble}
        hideHudOverlays={hideHudOverlays}
        emote={emote}
        care={careVitalsFromPet(pet)}
        moodId={pet.owner}
        onClick={onInspect}
      />
    </group>
  );
}

function RemotePet({
  pet,
  player,
  owner,
  selected,
  reducedMotion,
  bubble,
  hideHudOverlays,
  emote,
  onInspect,
}: {
  pet: PasturePet;
  player: {
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    z: number;
    cosmetics?: EquippedCosmetics;
  };
  owner: string | null;
  selected: boolean;
  reducedMotion: boolean;
  bubble?: string;
  hideHudOverlays?: boolean;
  emote?: { id: EmoteId; at: number } | null;
  onInspect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const moving = useRef(false);
  const started = useRef(false);
  const yaw = useRef(0);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (!started.current) {
      node.position.set(player.x, pasturePetY(player.x, player.z), player.z);
      started.current = true;
    }
    const dx = player.x - node.position.x;
    const dz = player.z - node.position.z;
    const dist = Math.hypot(dx, dz);
    const k = reducedMotion ? 1 : 1 - Math.pow(0.004, delta);
    node.position.x += dx * k;
    node.position.z += dz * k;
    node.position.y = pasturePetY(node.position.x, node.position.z);
    if (dist > 0.05) {
      const targetYaw = Math.atan2(dx, dz);
      yaw.current = lerpAngle(
        yaw.current,
        targetYaw,
        1 - Math.pow(0.001, delta),
      );
      node.rotation.y = yaw.current;
    }
    moving.current = dist > 0.12;
  });

  return (
    <group
      ref={group}
      position={[player.x, pasturePetY(player.x, player.z), player.z]}
    >
      <PetMesh
        look={pet.traits}
        name={pasturePetLabel({
          species: pet.traits.species,
          fallback: player.name,
        })}
        cosmetics={player.cosmetics || pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        yours={player.id === owner}
        movingRef={moving}
        bubble={bubble}
        hideHudOverlays={hideHudOverlays}
        emote={emote}
        care={careVitalsFromPet(pet)}
        moodId={pet.owner}
        onClick={onInspect}
      />
    </group>
  );
}

declare global {
  interface Window {
    __pasture3d?: PastureDebug;
  }
}

function StationProximity({
  poseRef,
  pendingOpenRef,
  onNearby,
  onArrive,
  skipKinds,
}: {
  poseRef: { current: { x: number; z: number } };
  pendingOpenRef: { current: PastureStationKind | null };
  onNearby: (station: WorldStation | null) => void;
  onArrive: (kind: PastureStationKind) => void;
  skipKinds?: ReadonlySet<string>;
}) {
  const lastId = useRef<string>("");
  const skipRef = useRef(skipKinds);
  skipRef.current = skipKinds;
  useFrame(() => {
    const near = nearbyInteractStation(
      poseRef.current,
      PASTURE_ZONE,
      skipRef.current,
    );
    const pending = pendingOpenRef.current;
    if (
      pending &&
      near &&
      near.kind === pending &&
      isPastureStationKind(near.kind)
    ) {
      pendingOpenRef.current = null;
      onArrive(near.kind);
    }
    const id = near?.id ?? "";
    if (id === lastId.current) return;
    lastId.current = id;
    onNearby(near);
  });
  return null;
}
