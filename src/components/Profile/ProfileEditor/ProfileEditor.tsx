import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { APPEARANCE_FONTS, APPEARANCE_TEXT_COLORS, clampAppearanceToPlan, parseAppearance, serializeAppearance, PLAN_THEMES, PLAN_BACKGROUNDS, type AppearanceBgId, type AppearanceFontId, type AppearanceTextColorId, type AppearanceThemeId } from "./appearance";
import { useUserStore } from "../../../stores/userStore";
import { getAstroTier } from "../../../utils/astro";
import { NAME_COLORS, type NameEffect } from "../../../utils/nameStyle";
import { ImageCropper } from "../../ui/ImageCropper";
import { ProfileCardView } from "../ProfileCardView";
import { uploadProfileImage, isDriveConnected, toImageUrl, getLastDriveError } from "../../../services/driveService";
import { DriveRequiredModal } from "../../Chat/DriveRequiredModal";
import "./ProfileEditor.css";
import "./AstroProfileEditor.css";
import {
  ALL_SHOP_ITEMS,
  KIND_CATALOG,
  KIND_LABEL,
  KIND_TITLE,
  TIER_TO_PLAN,
  catalogItem,
  isUnlocked,
  parseWishlist,
  skinClass,
  type CatalogItem,
  type CatalogKind,
  type WishlistEntry,
} from "./astroCatalog";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronsRight,
  Eye,
  Gamepad2,
  Info,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "./cn";

export type Plan = "free" | "astro" | "astroPlus" | "astroPlusGold";
export type SocialStatus = "online" | "away" | "dnd" | "invisible";
export type ProfileActionId = "request" | "message" | "report";
export type ProfileActivityInfo = { name: string; details?: string; startedAt?: number };
export type MutualProfileUser = { id: string; name: string; username?: string; photoUrl?: string };
export type MutualProfileServer = { id: string; name: string; photoUrl?: string; members?: number };
type ProfileTabId = "mural" | "activity" | "friends" | "servers";

export type MuralFieldId = "games" | "completedGames" | "recentGames" | "series" | "movies" | "music" | "albums" | "artists" | "actors";
export type MuralItem = { id: string; value: string; image: string };
export type MuralState = Record<MuralFieldId, MuralItem[]>;

export type FrameId = "none" | "pulsar" | "aurora" | "nebulosa" | "estelar" | "supernova" | "galaxia" | "infinito";

const ASSETS = {
  astroAvatar: "/manus-storage/astro-avatar-500x500_ed79d9c1.svg",
  freeAvatar: "/manus-storage/free-avatar-500x500_fe125bff.svg",
  astroPlusAvatar: "/manus-storage/astro-plus-avatar-500x500_cbcb0ba6.svg",
  astroPlusGoldAvatar: "/manus-storage/astro-plus-gold-avatar-500x500_e0ab7cf3.svg",
};

const MURAL_FIELD_DEFS: Array<{ id: MuralFieldId; label: string; placeholder: string; image: string; fallback: string; media: string; entity: string }> = [
  { id: "games", label: "Jogos favoritos", placeholder: "Ex.: Valorant, Minecraft, Stardew Valley", image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=640&q=80", fallback: "Adicione seus jogos favoritos", media: "software", entity: "software" },
  { id: "completedGames", label: "Jogos zerados", placeholder: "Ex.: Elden Ring, Hollow Knight, Celeste", image: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=640&q=80", fallback: "Mostre os jogos que você já zerou", media: "software", entity: "software" },
  { id: "recentGames", label: "Atividade nos últimos 7 dias", placeholder: "Ex.: Jogou Valorant e Minecraft há 2 dias", image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=640&q=80", fallback: "Seus jogos jogados nos últimos 7 dias", media: "software", entity: "software" },
  { id: "series", label: "Séries favoritas", placeholder: "Ex.: Arcane, The Last of Us", image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=640&q=80", fallback: "Adicione suas séries favoritas", media: "tvShow", entity: "tvSeason" },
  { id: "movies", label: "Filmes favoritos", placeholder: "Ex.: Interestelar, Duna", image: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=640&q=80", fallback: "Adicione seus filmes favoritos", media: "movie", entity: "movie" },
  { id: "music", label: "Músicas favoritas", placeholder: "Ex.: synthwave, indie, lo-fi", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=640&q=80", fallback: "Adicione suas músicas favoritas", media: "music", entity: "song" },
  { id: "albums", label: "Álbuns favoritos", placeholder: "Ex.: Random Access Memories", image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=640&q=80", fallback: "Adicione seus álbuns favoritos", media: "music", entity: "album" },
  { id: "artists", label: "Artistas favoritos", placeholder: "Ex.: Daft Punk, Jão", image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=640&q=80", fallback: "Adicione seus artistas favoritos", media: "music", entity: "musicArtist" },
  { id: "actors", label: "Atores favoritos", placeholder: "Ex.: Zendaya, Wagner Moura", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=640&q=80", fallback: "Adicione seus atores favoritos", media: "movie", entity: "movieArtist" },
];

export const EMPTY_MURAL: MuralState = {
  games: [],
  completedGames: [],
  recentGames: [],
  series: [],
  movies: [],
  music: [],
  albums: [],
  artists: [],
  actors: [],
};

const createMuralItem = (field: MuralFieldId, value = ""): MuralItem => ({
  id: `${field}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  value,
  image: MURAL_FIELD_DEFS.find((definition) => definition.id === field)?.image ?? "",
});

const planLabelOf = (plan: Plan) => plan === "astroPlusGold" ? "ASTRO PLUS" : plan === "astroPlus" ? "ASTRO+" : plan === "astro" ? "ASTRO" : "GRATUITO";

function settingString(settings: Record<string, unknown>, key: string, fallback: string): string {
  return typeof settings[key] === "string" ? settings[key] as string : fallback;
}

function imgSrc(url: string, size: number): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("http") || url.startsWith("blob:")) return url;
  return toImageUrl(url, size);
}

function nameStyleFor(id: string, effect: NameEffect, paid: boolean): { style: React.CSSProperties; className: string } {
  if (!paid) return { style: {}, className: "" };
  const color = NAME_COLORS.find((item) => item.id === id)?.color || "";
  if (effect === "neon" && color) return { style: { color, textShadow: `0 0 8px ${color}, 0 0 18px ${color}55` }, className: "" };
  if (color) return { style: { color }, className: "" };
  return { style: {}, className: effect === "shine" ? "fs-name-shine" : "" };
}

/* ─────────────────────────── componentinhos da prévia ─────────────────────────── */

function SkinThumb({ kind, id }: { kind: CatalogKind; id: string }) {
  const cls = skinClass(kind, id);
  if (kind === "avatar") {
    return <span className={cn("ape-item-avatar", cls)}><i /></span>;
  }
  if (kind === "nameplate") {
    return <span className={cn("ape-plate-sample", "ape-plate", cls)}>Nome</span>;
  }
  if (kind === "frame") {
    return (
      <span className="ape-item-preview" style={{ position: "relative" }}>
        <span className="ape-card-fill" />
        <span className={cn("ape-card", cls)} style={{ position: "absolute", inset: 4 }} />
      </span>
    );
  }
  return (
    <span className="ape-item-preview" style={{ position: "relative" }}>
      <span className="ape-card-fill" />
      <span className={cn("ape-effect-layer", cls)} />
    </span>
  );
}

function MiniCard({ displayName, username, avatarSrc, bannerStyle, decoration, nameplate, frame, effect, nameStyle, nameClassName, badge }: {
  displayName: string;
  username: string;
  avatarSrc?: string;
  bannerStyle?: React.CSSProperties;
  decoration: string;
  nameplate: string;
  frame: string;
  effect: string;
  nameStyle?: React.CSSProperties;
  nameClassName?: string;
  badge?: boolean;
}) {
  return (
    <div className={cn("ape-card", "ape-picker-preview-card", skinClass("frame", frame))}>
      <div className="ape-card-inner">
        <div className="ape-card-banner" style={bannerStyle} />
        <div className="ape-avatar-wrap">
          <div className={cn("ape-avatar", skinClass("avatar", decoration))}>
            <img src={avatarSrc || ASSETS.freeAvatar} alt="Avatar" />
          </div>
        </div>
        <div className="ape-card-body">
          <span className="ape-name-line">
            <span className={cn("ape-plate", skinClass("nameplate", nameplate))}>
              <span className={cn("ape-display-name", nameClassName)} style={nameStyle}>{displayName || "Seu nome"}</span>
            </span>
            {badge && <span className="ape-badge-astro"><Rocket size={15} /></span>}
          </span>
          <span className="ape-handle-line"><span className="ape-handle">@{username || "usuario"}</span></span>
        </div>
        {effect !== "none" && <span className={cn("ape-effect-layer", skinClass("effect", effect))} />}
      </div>
    </div>
  );
}

/* ─────────────────────────── picker de itens (Loja) ─────────────────────────── */

function CatalogPicker({ kind, current, plan, previewing, displayName, username, avatarSrc, bannerStyle, decoration, nameplate, frame, effect, nameStyle, nameClassName, badge, onApply, onClose, onLocked }: {
  kind: CatalogKind;
  current: string;
  plan: Plan;
  previewing: boolean;
  displayName: string;
  username: string;
  avatarSrc?: string;
  bannerStyle?: React.CSSProperties;
  decoration: string;
  nameplate: string;
  frame: string;
  effect: string;
  nameStyle?: React.CSSProperties;
  nameClassName?: string;
  badge?: boolean;
  onApply: (id: string) => void;
  onClose: () => void;
  onLocked: (item: CatalogItem) => void;
}) {
  const [tab, setTab] = useState<"mine" | "shop">("mine");
  const [pending, setPending] = useState(current);
  const items = KIND_CATALOG[kind];
  const unlocked = (item: CatalogItem) => previewing || isUnlocked(item, plan);
  const mineItems = items.filter((item) => item.id === "none" || unlocked(item));
  const shopLocked = items.filter((item) => item.id !== "none" && !unlocked(item));
  const shopOwned = items.filter((item) => item.id === "none" || unlocked(item));
  const apply = { decoration, nameplate, frame, effect };
  if (kind === "avatar") apply.decoration = pending;
  if (kind === "nameplate") apply.nameplate = pending;
  if (kind === "frame") apply.frame = pending;
  if (kind === "effect") apply.effect = pending;
  return (
    <div className="ape-picker-overlay" onClick={onClose}>
      <div className="ape-picker" onClick={(event) => event.stopPropagation()}>
        <div className="ape-picker-head">
          <h3>{KIND_TITLE[kind]}</h3>
          <button className="ape-close" style={{ position: "static" }} onClick={onClose} aria-label="Fechar"><X size={15} /></button>
        </div>
        <div className="ape-picker-body">
          <div className="ape-picker-left">
            <div className="ape-picker-tabs">
              <button className={cn("ape-picker-tab", tab === "mine" && "active")} onClick={() => setTab("mine")}>Suas opções</button>
              <button className={cn("ape-picker-tab", tab === "shop" && "active")} onClick={() => setTab("shop")}>{previewing ? "Todas" : "Loja"}</button>
            </div>
            {tab === "mine" ? (
              <>
                <h4 className="ape-picker-section">Suas {kind === "avatar" ? "decorações" : kind === "nameplate" ? "placas de identificação" : kind === "frame" ? "molduras" : "opções"}</h4>
                <div className="ape-item-grid">
                  {mineItems.map((item) => (
                    <button key={item.id} className={cn("ape-item", pending === item.id && "selected")} onClick={() => setPending(item.id)}>
                      {pending === item.id && <span className="ape-item-check"><Check size={11} strokeWidth={3} /></span>}
                      {item.id === "none" ? (
                        <span className="ape-item-preview" style={{ color: "var(--text-muted)" }}><X size={18} /></span>
                      ) : <SkinThumb kind={kind} id={item.id} />}
                      <span className="ape-item-name">{item.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {shopLocked.length > 0 && (
                  <>
                    <h4 className="ape-picker-section">Exclusivo do {previewing ? "ASTRO (prévia)" : "ASTRO"}</h4>
                    <div className="ape-item-grid">
                      {shopLocked.map((item) => (
                        <button key={item.id} className={cn("ape-item", "locked", pending === item.id && "selected")} onClick={() => previewing ? setPending(item.id) : onLocked(item)}>
                          {pending === item.id && <span className="ape-item-check"><Check size={11} strokeWidth={3} /></span>}
                          {!previewing && <span className="ape-item-lock"><LockKeyhole size={10} /></span>}
                          <SkinThumb kind={kind} id={item.id} />
                          <span className="ape-item-name">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <h4 className="ape-picker-section">Veja o que há na Loja</h4>
                <div className="ape-item-grid">
                  {shopOwned.map((item) => (
                    <button key={item.id} className={cn("ape-item", pending === item.id && "selected")} onClick={() => setPending(item.id)}>
                      {pending === item.id && <span className="ape-item-check"><Check size={11} strokeWidth={3} /></span>}
                      <SkinThumb kind={kind} id={item.id} />
                      <span className="ape-item-name">{item.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="ape-picker-right">
            <MiniCard displayName={displayName} username={username} avatarSrc={avatarSrc} bannerStyle={bannerStyle} decoration={apply.decoration} nameplate={apply.nameplate} frame={apply.frame} effect={apply.effect} nameStyle={nameStyle} nameClassName={nameClassName} badge={badge} />
            <p className="ape-edit-hint"><Pencil size={11} />Prévia em tempo real do seu perfil.</p>
          </div>
        </div>
        <div className="ape-picker-foot">
          <button className="ape-btn ape-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="ape-btn ape-btn-accent" onClick={() => { onApply(pending); onClose(); }}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── picker do estilo do nome ─────────────────────────── */

function NameStylePicker({ currentColor, currentEffect, currentBadge, paid, previewing, displayName, onApply, onClose, onLocked }: {
  currentColor: string;
  currentEffect: NameEffect;
  currentBadge: boolean;
  paid: boolean;
  previewing: boolean;
  displayName: string;
  onApply: (color: string, effect: NameEffect, badge: boolean) => void;
  onClose: () => void;
  onLocked: () => void;
}) {
  const [color, setColor] = useState(currentColor);
  const [effect, setEffect] = useState<NameEffect>(currentEffect);
  const [badge, setBadge] = useState(currentBadge);
  const active = paid || previewing;
  const preview = nameStyleFor(active ? color : "default", active ? effect : "none", active);
  const effects: Array<{ id: NameEffect; label: string }> = [
    { id: "none", label: "Sem efeito" },
    { id: "shine", label: "Brilho" },
    { id: "neon", label: "Neon" },
  ];
  return (
    <div className="ape-picker-overlay" onClick={onClose}>
      <div className="ape-picker" onClick={(event) => event.stopPropagation()}>
        <div className="ape-picker-head">
          <h3>Alterar estilo do nome exibido</h3>
          <button className="ape-close" style={{ position: "static" }} onClick={onClose} aria-label="Fechar"><X size={15} /></button>
        </div>
        <div className="ape-picker-body">
          <div className="ape-picker-left">
            <h4 className="ape-picker-section">Cor do nome</h4>
            {!active && <p className="ape-wish-empty">Cores e efeitos de nome são exclusivos do ASTRO. Entre na prévia para experimentar.</p>}
            <div className="ape-item-grid">
              {NAME_COLORS.map((item) => (
                <button key={item.id} className={cn("ape-item", color === item.id && "selected", !active && "locked")} onClick={() => active ? setColor(item.id) : onLocked()}>
                  {color === item.id && <span className="ape-item-check"><Check size={11} strokeWidth={3} /></span>}
                  <span className="ape-item-preview"><span className="ape-plate-sample" style={{ fontSize: 13, fontWeight: 800, color: item.color || "var(--text-primary)" }}>Ab</span></span>
                  <span className="ape-item-name">{item.label}</span>
                </button>
              ))}
            </div>
            <h4 className="ape-picker-section">Efeito</h4>
            <div className="ape-effect-grid">
              {effects.map((item) => (
                <button key={item.id} className={cn("ape-effect-option", effect === item.id && "active")} onClick={() => active ? setEffect(item.id) : onLocked()}>
                  <span>{item.label}</span>
                  {effect === item.id && <Check size={14} />}
                </button>
              ))}
            </div>
            <h4 className="ape-picker-section">Insígnia</h4>
            <div className="ape-switch-row">
              <span>Mostrar insígnia ASTRO ao lado do nome</span>
              <button className={cn("ape-switch", badge && active && "active")} aria-label="Alternar insígnia" onClick={() => active ? setBadge(!badge) : onLocked()} />
            </div>
          </div>
          <div className="ape-picker-right">
            <div className="ape-name-style-preview">
              <span className={preview.className} style={preview.style}>{displayName || "Seu nome"}</span>
            </div>
            <p className="ape-edit-hint"><Pencil size={11} />Assim seu nome aparece no perfil e no chat.</p>
          </div>
        </div>
        <div className="ape-picker-foot">
          <button className="ape-btn ape-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="ape-btn ape-btn-accent" onClick={() => { onApply(color, effect, badge); onClose(); }}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── mural (editores legados) ─────────────────────────── */

function MuralItemEditor({ definition, item, index, onChange, onImageChange, onRemove }: { definition: (typeof MURAL_FIELD_DEFS)[number]; item: MuralItem; index: number; onChange: (value: string) => void; onImageChange: (image: string) => void; onRemove: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const term = item.value.split('·')[0].trim();
    if (!term) { setIsLoading(false); setHasError(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        let image: string | undefined;
        if (definition.id === "series") {
          const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`, { signal: controller.signal });
          if (!response.ok) throw new Error("image lookup failed");
          const data = await response.json() as Array<{ show?: { image?: { medium?: string; original?: string } } }>;
          image = data?.[0]?.show?.image?.medium ?? data?.[0]?.show?.image?.original ?? undefined;
        } else if (definition.id === "actors") {
          const response = await fetch(`https://api.tvmaze.com/search/people?q=${encodeURIComponent(term)}`, { signal: controller.signal });
          if (!response.ok) throw new Error("image lookup failed");
          const data = await response.json() as Array<{ person?: { image?: { medium?: string; original?: string } } }>;
          image = data?.[0]?.person?.image?.medium ?? data?.[0]?.person?.image?.original ?? undefined;
        } else {
          const params = new URLSearchParams({ term, media: definition.media, entity: definition.entity, limit: "1" });
          const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, { signal: controller.signal });
          if (!response.ok) throw new Error("image lookup failed");
          const data = await response.json() as { results?: Array<{ artworkUrl100?: string; artworkUrl600?: string }> };
          const result = data.results?.[0];
          image = result?.artworkUrl600 ?? result?.artworkUrl100?.replace("100x100bb", "600x600bb");
        }
        if (image && image !== item.image) onImageChange(image);
        else if (!image) setHasError(true);
      } catch {
        if (!controller.signal.aborted) setHasError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [definition.entity, definition.media, item.value, onImageChange, retry, item.image]);
  return <article className="mural-item-editor"><div className="mural-widget-editor-image"><img src={item.image} alt={`Capa de ${item.value || definition.label}`} /><span className={cn("mural-widget-load-state", isLoading && "is-loading", hasError && "has-error")}>{isLoading ? "Buscando foto..." : hasError || !item.value.trim() ? "Capa padrão" : "Foto carregada"}</span></div><div className="mural-widget-editor-fields"><label><span>{index + 1}. {definition.label}</span><input className="social-input" maxLength={100} value={item.value} onChange={(event) => onChange(event.target.value)} placeholder={definition.placeholder} /></label><div className="mural-widget-editor-footer"><small>{hasError ? "Não encontramos uma capa; tente outro nome." : "A foto é atualizada automaticamente."}</small><div className="mural-item-actions"><button type="button" onClick={() => setRetry((value) => value + 1)} disabled={!item.value.trim() || isLoading}><Search size={11} />Buscar capa</button><button className="mural-remove-item" type="button" aria-label={`Remover ${item.value || definition.label}`} onClick={onRemove}><Trash2 size={11} /></button></div></div></div></article>;
}

function MuralCategoryEditor({ definition, items, onAdd, onAutoFill, onChange, onImageChange, onRemove }: { definition: (typeof MURAL_FIELD_DEFS)[number]; items: MuralItem[]; onAdd: () => void; onAutoFill?: () => void; onChange: (itemId: string, value: string) => void; onImageChange: (itemId: string, image: string) => void; onRemove: (itemId: string) => void }) {
  return <section className="mural-category-editor"><div className="mural-category-heading"><div><strong>{definition.label}</strong><small>{items.length} {items.length === 1 ? "item" : "itens"} configurado(s)</small></div><div style={{ display: "flex", gap: 6 }}>{onAutoFill && <button className="mural-add-item-button" type="button" onClick={onAutoFill}>Usar minha atividade</button>}<button className="mural-add-item-button" type="button" onClick={onAdd}>+ Adicionar item</button></div></div>{items.length ? <div className="mural-items-list">{items.map((item, index) => <MuralItemEditor key={item.id} definition={definition} item={item} index={index} onChange={(value) => onChange(item.id, value)} onImageChange={(image) => onImageChange(item.id, image)} onRemove={() => onRemove(item.id)} />)}</div> : <p className="mural-category-empty">Adicione o primeiro item desta categoria.</p>}</section>;
}

/* ─────────────────────────── prévia usada no modal Social ─────────────────────────── */

function ProfilePreview({ plan, displayName, username, about, statusMessage, showActivity, showServers, showMutualFriends, mural, selectedMuralFields, selectedFrame, onViewProfile, onProfileAction }: {
  plan: Plan;
  displayName: string;
  username: string;
  about: string;
  socialStatus: SocialStatus;
  statusMessage: string;
  showActivity: boolean;
  showServers: boolean;
  showMutualFriends: boolean;
  mural: MuralState;
  selectedMuralFields: MuralFieldId[];
  selectedFrame: FrameId;
  onViewProfile: () => void;
  onProfileAction: (action: ProfileActionId) => void;
}) {
  const planLabel = planLabelOf(plan);
  const visibleMural = MURAL_FIELD_DEFS.filter((definition) => selectedMuralFields.includes(definition.id));
  const avatar = plan === "free" ? ASSETS.freeAvatar : plan === "astro" ? ASSETS.astroAvatar : plan === "astroPlus" ? ASSETS.astroPlusAvatar : ASSETS.astroPlusGoldAvatar;
  return (
    <section className={cn("profile-preview-section", plan === "astro" && "astro-profile-preview", plan === "astroPlus" && "astro-plus-tier-profile-preview", plan === "astroPlusGold" && "astro-plus-gold-profile-preview")}>
      <div className="profile-preview-heading">
        <div><span className="profile-preview-kicker">VISUALIZAÇÃO EM TEMPO REAL</span><h2>Preview do perfil</h2><p>Veja como suas escolhas aparecem para outras pessoas.</p></div>
        <div className="profile-preview-heading-actions"><span className="profile-preview-plan">{planLabel}</span><button className="profile-preview-view-button" type="button" onClick={onViewProfile}><Eye size={12} />Ver perfil</button></div>
      </div>
      <ProfileCardView
        displayName={displayName}
        username={username}
        about={about}
        statusMessage={statusMessage}
        avatarSrc={avatar}
        paid={plan !== "free"}
        avatarClass={`profile-frame-${selectedFrame}`}
        className="profile-preview-ape-card"
      >
        <div className="profile-preview-meta"><span><b>{showActivity ? "Atividade visível" : "Atividade oculta"}</b></span><span>{showServers ? "Servidores em comum" : "Servidores privados"}</span><span>{showMutualFriends ? "Amigos em comum" : "Amigos privados"}</span></div>
        <div className="profile-card-actions" aria-label="Ações do perfil"><button type="button" className="profile-card-action primary" onClick={() => onProfileAction("request")}><UserPlus size={13} />Mandar solicitação</button><button type="button" className="profile-card-action" onClick={() => onProfileAction("message")}><MessageCircle size={13} />Conversar</button><button type="button" className="profile-card-action danger" onClick={() => onProfileAction("report")}><ShieldCheck size={13} />Denunciar usuário</button></div>
        <div className="profile-mural-preview">
          <div className="profile-mural-header"><div><span className="profile-preview-kicker">MURAL</span><h4>Preferências de {displayName || "seu perfil"}</h4></div><Sparkles size={15} /></div>
          <div className="profile-mural-list">{visibleMural.length ? visibleMural.flatMap(({ id, label, fallback }) => (mural[id] || []).map((item) => <article className="profile-mural-widget" key={item.id}><img src={item.image} alt={`Imagem de ${item.value || label}`} /><div><span>{label}</span><strong>{item.value.trim() || fallback}</strong></div></article>)) : <p className="profile-mural-empty">Selecione categorias para montar seu Mural.</p>}</div>
        </div>
      </ProfileCardView>
    </section>
  );
}

/* ─────────────────────────── perfil público ─────────────────────────── */

const PROFILE_STATUS_COLOR: Record<SocialStatus, string> = {
  online: "#22c55e",
  away: "#f59e0b",
  dnd: "#ef4444",
  invisible: "#94a3b8",
};

const formatProfileDate = (value?: number) => (value ?? 0) > 0 ? new Date(value as number).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : undefined;

export function PublicProfileModal({ plan, displayName, username, about, socialStatus, statusMessage, showActivity, showServers, showMutualFriends, mural, selectedMuralFields, selectedFrame, photoUrl, bannerUrl, isSelf, nameplateId, profileFrameId, profileEffectId, nameColorId, nameEffectId, showAstroBadge, verified, isFriend, joinedAt, pronoun, friendsSince, activity, mutualFriends, mutualServers, mutualLoading, targetUserId, following, blocked, busy, onFollow, onBlock, onEdit, onClose, onProfileAction }: {
  plan: Plan;
  displayName: string;
  username: string;
  about: string;
  socialStatus: SocialStatus;
  statusMessage: string;
  showActivity: boolean;
  showServers: boolean;
  showMutualFriends: boolean;
  mural: MuralState;
  selectedMuralFields: MuralFieldId[];
  selectedFrame: FrameId;
  photoUrl?: string;
  bannerUrl?: string;
  isSelf?: boolean;
  nameplateId?: string;
  profileFrameId?: string;
  profileEffectId?: string;
  nameColorId?: string;
  nameEffectId?: NameEffect;
  showAstroBadge?: boolean;
  verified?: boolean;
  isFriend?: boolean;
  joinedAt?: number;
  pronoun?: string;
  friendsSince?: number;
  activity?: ProfileActivityInfo;
  mutualFriends?: MutualProfileUser[];
  mutualServers?: MutualProfileServer[];
  mutualLoading?: boolean;
  targetUserId?: string;
  following?: boolean;
  blocked?: boolean;
  busy?: boolean;
  onFollow?: () => void;
  onBlock?: () => void;
  onEdit?: () => void;
  onClose: () => void;
  onProfileAction: (action: ProfileActionId) => void;
}) {
  const avatar = photoUrl || (plan === "free" ? ASSETS.freeAvatar : plan === "astro" ? ASSETS.astroAvatar : plan === "astroPlus" ? ASSETS.astroPlusAvatar : ASSETS.astroPlusGoldAvatar);
  const paid = plan !== "free";
  const namePreview = nameStyleFor(paid ? (nameColorId || "default") : "default", paid ? (nameEffectId || "none") : "none", paid);
  const plateClass = paid ? skinClass("nameplate", nameplateId || "none") : "";
  const frameClass = paid ? skinClass("frame", profileFrameId || "none") : "";
  const effectClass = paid ? skinClass("effect", profileEffectId || "none") : "";
  const [tab, setTab] = useState<ProfileTabId>("mural");
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const noteKey = targetUserId ? `friends-space:profile-note:${targetUserId}` : "";
  const memberSince = formatProfileDate(joinedAt);
  const friendsSinceLabel = formatProfileDate(friendsSince);
  const visibleMural = MURAL_FIELD_DEFS.filter((definition) => selectedMuralFields.includes(definition.id) && (mural[definition.id]?.length ?? 0) > 0);
  const recentGames = (mural.recentGames || []).filter((item) => item.value.trim());

  useEffect(() => {
    if (!noteKey) { setNote(""); return; }
    try { setNote(localStorage.getItem(noteKey) || ""); } catch { setNote(""); }
    setEditingNote(false);
  }, [noteKey]);

  useEffect(() => {
    if ((tab === "friends" && (isSelf || !showMutualFriends)) || (tab === "servers" && (isSelf || !showServers))) setTab("mural");
  }, [tab, isSelf, showMutualFriends, showServers]);

  const saveNote = (value: string) => {
    setNote(value);
    try { if (noteKey) localStorage.setItem(noteKey, value); } catch { /* armazenamento indisponível */ }
  };

  const tabs: Array<{ id: ProfileTabId; label: string }> = [
    { id: "mural", label: "Mural" },
    { id: "activity", label: "Atividade" },
  ];
  if (!isSelf && showMutualFriends) {
    tabs.push({ id: "friends", label: mutualFriends ? `${mutualFriends.length} ${mutualFriends.length === 1 ? "amigo mútuo" : "amigos mútuos"}` : "Amigos mútuos" });
  }
  if (!isSelf && showServers) {
    tabs.push({ id: "servers", label: mutualServers ? `${mutualServers.length} ${mutualServers.length === 1 ? "servidor mútuo" : "servidores mútuos"}` : "Servidores mútuos" });
  }

  const actions = isSelf
    ? (onEdit ? <div className="pfm-actions"><button className="pfm-action primary" type="button" onClick={onEdit}><Pencil size={14} />Editar perfil</button></div> : undefined)
    : (
      <div className="pfm-actions">
        <button className="pfm-action primary" type="button" onClick={() => onProfileAction("message")}><MessageCircle size={14} />Mensagem</button>
        {isFriend
          ? <span className="pfm-icon-button is-success" title="Vocês são amigos" aria-label="Vocês são amigos"><Check size={16} /></span>
          : <button className="pfm-icon-button" type="button" title="Mandar solicitação de amizade" aria-label="Mandar solicitação de amizade" onClick={() => onProfileAction("request")}><UserPlus size={16} /></button>}
        <details className="pfm-more">
          <summary className="pfm-icon-button" title="Mais opções" aria-label="Mais opções"><MoreHorizontal size={18} /></summary>
          <div className="pfm-more-menu">
            {onFollow && <button type="button" disabled={busy} onClick={(event) => { onFollow(); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}><UserPlus size={14} />{following ? "Deixar de seguir" : "Seguir"}</button>}
            {onBlock && <button type="button" disabled={busy} onClick={(event) => { onBlock(); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}><LockKeyhole size={14} />{blocked ? "Desbloquear" : "Bloquear"}</button>}
            <button type="button" className="danger" onClick={() => onProfileAction("report")}><ShieldCheck size={14} />Denunciar usuário</button>
          </div>
        </details>
      </div>
    );

  return (
    <div className="public-profile-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="pfm-modal" role="dialog" aria-modal="true" aria-label={isSelf ? "Seu perfil" : `Perfil de ${displayName || "usuário"}`} onMouseDown={(event) => event.stopPropagation()}>
        <button className="pfm-close" type="button" aria-label="Fechar perfil" onClick={onClose}><X size={18} /></button>
        <aside className="pfm-left" style={{ "--pfm-status": PROFILE_STATUS_COLOR[socialStatus] } as CSSProperties}>
          <ProfileCardView
            displayName={displayName}
            username={username}
            about={about}
            emptyAbout="Este usuário ainda não escreveu uma apresentação."
            avatarSrc={avatar}
            bannerStyle={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : undefined}
            statusMessage={statusMessage}
            memberSince={memberSince}
            pronoun={pronoun}
            verified={verified}
            paid={paid}
            showAstroBadge={showAstroBadge}
            plateClass={plateClass}
            nameClass={namePreview.className}
            nameStyle={namePreview.style}
            avatarClass={`profile-frame-${selectedFrame}`}
            cardClass={frameClass}
            effectClass={effectClass}
            className="pfm-profile-card"
            actions={actions}
            details={(
              <>
                {friendsSinceLabel && (
                  <>
                    <div className="ape-block-label">Amigos desde</div>
                    <p className="ape-member-since">{friendsSinceLabel}</p>
                  </>
                )}
                {!isSelf && targetUserId && (
                  <div className="pfm-note">
                    <div className="ape-block-label">Nota <span>· visível apenas para você</span></div>
                    {editingNote
                      ? <textarea className="pfm-note-input" value={note} autoFocus placeholder="Clique para adicionar uma nota" onChange={(event) => saveNote(event.target.value)} onBlur={() => setEditingNote(false)} />
                      : <button className={cn("pfm-note-preview", !note && "is-empty")} type="button" onClick={() => setEditingNote(true)}>{note || "Clique para adicionar uma nota"}</button>}
                  </div>
                )}
              </>
            )}
          />
        </aside>
        <div className="pfm-right">
          <nav className="pfm-tabs" role="tablist" aria-label="Seções do perfil">
            {tabs.map((entry) => (
              <button key={entry.id} className={cn("pfm-tab", tab === entry.id && "is-active")} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}>{entry.label}</button>
            ))}
          </nav>
          <div className="pfm-tab-body" role="tabpanel">
            {tab === "mural" && (visibleMural.length
              ? (
                <div className="pfm-widget-grid">
                  {visibleMural.flatMap((definition) => (mural[definition.id] || []).map((item) => {
                    const value = item.value.trim() || definition.fallback;
                    const image = item.image || definition.image;
                    return (
                      <article className="pfm-widget" key={`${definition.id}:${item.id}`}>
                        {image ? <div className="pfm-widget-image" role="img" aria-label={`Imagem de ${value}`} style={{ backgroundImage: `url("${image}")` }} /> : <div className="pfm-widget-image is-fallback">{value.charAt(0).toUpperCase()}</div>}
                        <div className="pfm-widget-body"><span className="pfm-widget-tag">{definition.label}</span><strong title={value}>{value}</strong></div>
                        <MoreHorizontal className="pfm-widget-more" size={16} />
                      </article>
                    );
                  }))}
                </div>
              )
              : (
                <div className="pfm-empty">
                  <Sparkles size={28} />
                  <strong>Mural vazio</strong>
                  <p>{isSelf ? "Monte seu Mural no Editar perfil, em Social, para mostrar seus gostos aqui." : "Este usuário ainda não montou o Mural."}</p>
                </div>
              ))}
            {tab === "activity" && (!showActivity
              ? <div className="pfm-empty"><Gamepad2 size={28} /><strong>Atividade privada</strong><p>Este usuário prefere manter a atividade privada.</p></div>
              : (!activity && recentGames.length === 0)
                ? <div className="pfm-empty"><Gamepad2 size={28} /><strong>Nenhuma atividade recente</strong><p>Quando este usuário estiver jogando ou ouvindo algo, vai aparecer aqui.</p></div>
                : (
                  <>
                    {activity && (
                      <article className="pfm-activity-card">
                        <span className="pfm-activity-icon"><Gamepad2 size={22} /></span>
                        <div className="pfm-activity-info">
                          <strong>{activity.name}</strong>
                          {activity.details && <p>{activity.details}</p>}
                          <small>{activity.startedAt ? `Iniciada às ${new Date(activity.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Agora"}</small>
                        </div>
                      </article>
                    )}
                    {recentGames.length > 0 && (
                      <>
                        <div className="pfm-section-title"><Gamepad2 size={13} />Jogos recentes</div>
                        <div className="pfm-widget-grid">
                          {recentGames.map((item) => {
                            const value = item.value.trim() || "Jogo recente";
                            const image = item.image || MURAL_FIELD_DEFS.find((definition) => definition.id === "recentGames")?.image || "";
                            return (
                              <article className="pfm-widget" key={item.id}>
                                {image ? <div className="pfm-widget-image" role="img" aria-label={`Imagem de ${value}`} style={{ backgroundImage: `url("${image}")` }} /> : <div className="pfm-widget-image is-fallback">{value.charAt(0).toUpperCase()}</div>}
                                <div className="pfm-widget-body"><span className="pfm-widget-tag">Atividade nos últimos 7 dias</span><strong title={value}>{value}</strong></div>
                                <MoreHorizontal className="pfm-widget-more" size={16} />
                              </article>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                ))}
            {tab === "friends" && (mutualLoading && !mutualFriends
              ? <div className="pfm-empty"><Users size={28} /><strong>Carregando amigos mútuos...</strong><p>Buscando conexões em comum.</p></div>
              : mutualFriends?.length
                ? (
                  <div className="pfm-people">
                    {mutualFriends.map((friend) => (
                      <div className="pfm-person" key={friend.id}>
                        <span className="pfm-person-avatar">{friend.photoUrl ? <img src={friend.photoUrl} alt={`Avatar de ${friend.name}`} /> : (friend.name || "?").charAt(0).toUpperCase()}</span>
                        <span className="pfm-person-info"><strong>{friend.name}</strong><span>@{friend.username || "usuario"}</span></span>
                      </div>
                    ))}
                  </div>
                )
                : <div className="pfm-empty"><Users size={28} /><strong>Nenhum amigo em comum</strong><p>Vocês ainda não têm amigos em comum.</p></div>)}
            {tab === "servers" && (mutualLoading && !mutualServers
              ? <div className="pfm-empty"><Server size={28} /><strong>Carregando servidores mútuos...</strong><p>Buscando servidores em comum.</p></div>
              : mutualServers?.length
                ? (
                  <div className="pfm-people">
                    {mutualServers.map((server) => (
                      <div className="pfm-person" key={server.id}>
                        <span className="pfm-server-icon">{server.photoUrl ? <img src={server.photoUrl} alt={`Ícone de ${server.name}`} /> : (server.name || "?").charAt(0).toUpperCase()}</span>
                        <span className="pfm-person-info"><strong>{server.name}</strong><span>{server.members ? `${server.members} membros` : "Servidor em comum"}</span></span>
                      </div>
                    ))}
                  </div>
                )
                : <div className="pfm-empty"><Server size={28} /><strong>Nenhum servidor em comum</strong><p>Vocês ainda não estão nos mesmos servidores.</p></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────── modal Social (status/privacidade/mural) ─────────────────────────── */

function SocialSettingsModal({ plan, displayName, username, about, selectedFrame, status, onStatusChange, statusMessage, onStatusMessageChange, showActivity, setShowActivity, showServers, setShowServers, showMutualFriends, setShowMutualFriends, mural, selectedMuralFields, onMuralFieldToggle, onMuralItemAdd, onMuralAutoFill, onMuralItemChange, onMuralImageChange, onMuralItemRemove, onClose, onNotify, onViewProfile, onProfileAction }: {
  plan: Plan;
  displayName: string;
  username: string;
  about: string;
  selectedFrame: FrameId;
  status: SocialStatus;
  onStatusChange: (status: SocialStatus) => void;
  statusMessage: string;
  onStatusMessageChange: (message: string) => void;
  showActivity: boolean;
  setShowActivity: (value: boolean) => void;
  showServers: boolean;
  setShowServers: (value: boolean) => void;
  showMutualFriends: boolean;
  setShowMutualFriends: (value: boolean) => void;
  mural: MuralState;
  selectedMuralFields: MuralFieldId[];
  onMuralFieldToggle: (field: MuralFieldId) => void;
  onMuralItemAdd: (field: MuralFieldId) => void;
  onMuralAutoFill: (field: MuralFieldId) => void;
  onMuralItemChange: (field: MuralFieldId, itemId: string, value: string) => void;
  onMuralImageChange: (field: MuralFieldId, itemId: string, image: string) => void;
  onMuralItemRemove: (field: MuralFieldId, itemId: string) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
  onViewProfile: () => void;
  onProfileAction: (action: ProfileActionId) => void;
}) {
  const statuses: Array<{ id: SocialStatus; label: string; color: string }> = [
    { id: "online", label: "Online", color: "#22c55e" },
    { id: "away", label: "Ausente", color: "#f59e0b" },
    { id: "dnd", label: "Não Perturbe", color: "#ef4444" },
    { id: "invisible", label: "Invisível", color: "#94a3b8" },
  ];
  const toggles = [["Mostrar atividade", showActivity, setShowActivity], ["Mostrar servidores em comum", showServers, setShowServers], ["Mostrar amigos em comum", showMutualFriends, setShowMutualFriends]] as const;
  return (
    <div className="social-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="social-modal social-modal-expanded" role="dialog" aria-modal="true" aria-labelledby="social-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="social-modal-header"><div><span className="social-modal-kicker">VISIBILIDADE DO PERFIL</span><h2 id="social-settings-title">Social</h2><p>Escolha como outras pessoas verão sua presença, conexões e mural.</p></div><button className="frames-shop-close" type="button" aria-label="Fechar configurações sociais" onClick={onClose}><X size={18} /></button></header>
        <div className="social-modal-layout">
          <div className="social-modal-body">
            <div className="social-control-group"><label>Status</label><div className="social-status-grid">{statuses.map((item) => <button key={item.id} type="button" className={cn("social-status-btn", status === item.id && "selected")} onClick={() => onStatusChange(item.id)} aria-pressed={status === item.id}><span className="social-status-dot" style={{ background: item.color }} />{item.label}</button>)}</div></div>
            <div className="social-control-group"><label htmlFor="social-status-message">Mensagem de Status</label><input id="social-status-message" className="social-input" maxLength={80} value={statusMessage} onChange={(event) => onStatusMessageChange(event.target.value)} placeholder="O que você está fazendo?" /><small className="social-character-count">{statusMessage.length}/80</small></div>
            <div className="social-control-group"><label>Privacidade</label>{toggles.map(([label, value, setter]) => <div className="social-toggle-row" key={label}><span>{label}</span><button type="button" className={cn("social-switch", value && "active")} aria-pressed={value} aria-label={`${label}: ${value ? "ativado" : "desativado"}`} onClick={() => setter(!value)}><span /></button></div>)}</div>
            <div className="social-control-group mural-settings-group"><div className="mural-settings-heading"><div><label>Mural</label><p>Escolha as categorias que deseja mostrar. Você pode adicionar vários itens em todas elas.</p></div><span>{selectedMuralFields.length}/9 categorias</span></div><div className="mural-category-selector">{MURAL_FIELD_DEFS.map((definition) => { const selected = selectedMuralFields.includes(definition.id); return <button className={cn("mural-category-toggle", selected && "selected")} type="button" key={definition.id} aria-pressed={selected} onClick={() => onMuralFieldToggle(definition.id)}><span>{selected ? "✓" : "+"}</span>{definition.label}</button>; })}</div><div className="mural-selected-categories">{selectedMuralFields.length ? selectedMuralFields.map((field) => { const definition = MURAL_FIELD_DEFS.find((item) => item.id === field)!; return <MuralCategoryEditor key={field} definition={definition} items={mural[field]} onAdd={() => onMuralItemAdd(field)} onAutoFill={field === 'recentGames' ? () => onMuralAutoFill(field) : undefined} onChange={(itemId, value) => onMuralItemChange(field, itemId, value)} onImageChange={(itemId, image) => onMuralImageChange(field, itemId, image)} onRemove={(itemId) => onMuralItemRemove(field, itemId)} />; }) : <p className="mural-selection-empty">Escolha uma ou mais categorias acima para começar a montar seu Mural.</p>}</div></div>
          </div>
          <ProfilePreview plan={plan} displayName={displayName} username={username} about={about} socialStatus={status} statusMessage={statusMessage} showActivity={showActivity} showServers={showServers} showMutualFriends={showMutualFriends} mural={mural} selectedMuralFields={selectedMuralFields} selectedFrame={selectedFrame} onViewProfile={onViewProfile} onProfileAction={onProfileAction} />
        </div>
        <footer className="social-modal-footer"><button type="button" onClick={() => { onNotify("Configurações sociais e mural atualizados"); onClose(); }}>Concluir</button></footer>
      </section>
    </div>
  );
}

/* ─────────────────────────── editor principal ─────────────────────────── */

export default function ProfileEditor({ onClose }: { onClose?: () => void }) {
  const { currentUser, updateUser } = useUserStore();
  const userSettings = (currentUser?.settings || {}) as Record<string, unknown>;
  const tier = getAstroTier(currentUser);
  const savedPlan = TIER_TO_PLAN[tier];
  const paid = tier !== "none";
  const savedAppearance = useMemo(() => clampAppearanceToPlan(parseAppearance(userSettings), savedPlan), [userSettings, savedPlan]);

  const [displayName, setDisplayName] = useState(currentUser?.name || "");
  const [username, setUsername] = useState(currentUser?.friendCode || "");
  const [about, setAbout] = useState(currentUser?.bio || "");
  const [photoUrl, setPhotoUrl] = useState(currentUser?.photoUrl || "");
  const [bannerUrl, setBannerUrl] = useState(currentUser?.bannerUrl || "");
  const [editingField, setEditingField] = useState<"name" | "username" | "about" | null>(null);

  const [decoration, setDecoration] = useState(settingString(userSettings, "frame", "none"));
  const [nameplate, setNameplate] = useState(settingString(userSettings, "nameplate", "none"));
  const [profileFrame, setProfileFrame] = useState(settingString(userSettings, "profileFrame", "none"));
  const [profileEffect, setProfileEffect] = useState(settingString(userSettings, "profileEffect", "none"));
  const [accent, setAccent] = useState(currentUser?.accentColor || "#29A3FF");
  const [nameColor, setNameColor] = useState(settingString(userSettings, "nameColor", "default"));
  const [nameEffect, setNameEffect] = useState<NameEffect>((settingString(userSettings, "nameEffect", "none") as NameEffect) || "none");
  const [astroBadge, setAstroBadge] = useState(userSettings.astroBadge !== false);
  const [wishlist, setWishlist] = useState<WishlistEntry[]>(() => parseWishlist(userSettings.wishlist));

  const [socialStatus, setSocialStatus] = useState<SocialStatus>("online");
  const [statusMessage, setStatusMessage] = useState("");
  const [showActivity, setShowActivity] = useState(true);
  const [showServers, setShowServers] = useState(true);
  const [showMutualFriends, setShowMutualFriends] = useState(true);
  const [mural, setMural] = useState<MuralState>(() => {
    const raw = (userSettings.mural || {}) as Record<string, unknown>
    const out = { ...EMPTY_MURAL }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const field of Object.keys(EMPTY_MURAL) as MuralFieldId[]) {
        const items = raw[field]
        out[field] = Array.isArray(items) ? items as MuralItem[] : []
      }
    }
    return out
  });
  const [selectedMuralFields, setSelectedMuralFields] = useState<MuralFieldId[]>(() => {
    const raw = userSettings.muralFields
    if (Array.isArray(raw)) return raw.filter((id): id is MuralFieldId => id in EMPTY_MURAL)
    return []
  });

  const [tab, setTab] = useState<"mural" | "activity" | "wishlist">("mural");
  const [picker, setPicker] = useState<CatalogKind | "nameStyle" | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [activity, setActivity] = useState<Array<{ app: string; seconds: number }> | null>(null);
  const [infoBoxOpen, setInfoBoxOpen] = useState(true);

  const [selectedTheme, setSelectedTheme] = useState<string>(savedAppearance.theme);
  const [selectedFont, setSelectedFont] = useState<string>(savedAppearance.font);
  const [selectedBg, setSelectedBg] = useState<string>(savedAppearance.bg);
  const [selectedTextColor, setSelectedTextColor] = useState<AppearanceTextColorId>(savedAppearance.textColor);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isPublicProfileOpen, setIsPublicProfileOpen] = useState(false);

  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropShape, setCropShape] = useState<"circle" | "rect">("circle");
  const [cropAspect, setCropAspect] = useState(1);
  const [driveModal, setDriveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const pendingDriveAction = useRef<"avatar" | "banner" | null>(null);
  const previewSnapshot = useRef<{ decoration: string; nameplate: string; profileFrame: string; profileEffect: string; nameColor: string; nameEffect: NameEffect; astroBadge: boolean } | null>(null);

  const renderPlan: Plan = previewing ? "astroPlusGold" : savedPlan;
  const renderPaid = previewing || paid;
  const namePreview = nameStyleFor(nameColor, nameEffect, renderPaid);
  const avatarSrc = photoUrl ? imgSrc(photoUrl, 512) : (renderPlan === "free" ? ASSETS.freeAvatar : renderPlan === "astro" ? ASSETS.astroAvatar : renderPlan === "astroPlus" ? ASSETS.astroPlusAvatar : ASSETS.astroPlusGoldAvatar);
  const bannerStyle = bannerUrl ? { backgroundImage: `url("${imgSrc(bannerUrl, 1200)}")` } : { backgroundImage: `linear-gradient(120deg, ${accent}88, ${accent}22)` };

  const displayCount = useMemo(() => `${displayName.length}/20`, [displayName]);
  const usernameCount = useMemo(() => `${username.length}/20`, [username]);
  const memberSince = useMemo(() => {
    const ts = Number(currentUser?.createdAt || 0);
    return new Date(ts > 0 ? ts : Date.now()).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  }, [currentUser?.createdAt]);

  useEffect(() => {
    if (tab !== "activity" || activity !== null) return;
    let alive = true;
    void (async () => {
      try {
        const { getTopApps } = await import("../../../services/activityService");
        const top = await getTopApps(8);
        if (alive) setActivity(top);
      } catch {
        if (alive) setActivity([]);
      }
    })();
    return () => { alive = false; };
  }, [tab, activity]);

  const notify = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2200);
  };

  const toggleMuralField = (field: MuralFieldId) => {
    setSelectedMuralFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field]);
  };
  const fillRecentFromActivity = async () => {
    try {
      const { getTopApps, formatUsage } = await import('../../../services/activityService')
      const top = await getTopApps(5)
      if (!top.length) { notify('Sem atividade registrada nos últimos 7 dias (só no app desktop)'); return }
      setMural((current) => ({ ...current, recentGames: top.map((a) => ({ ...createMuralItem('recentGames'), value: `${a.app} · ${formatUsage(a.seconds)}` })) }))
      notify('Atividade preenchida!');
    } catch { notify('Não foi possível ler a atividade') }
  };
  const addMuralItem = (field: MuralFieldId) => {
    setMural((current) => ({ ...current, [field]: [...current[field], createMuralItem(field)] }));
  };
  const updateMuralItem = (field: MuralFieldId, itemId: string, value: string) => {
    setMural((current) => ({ ...current, [field]: current[field].map((item) => item.id === itemId ? { ...item, value } : item) }));
  };
  const updateMuralImage = (field: MuralFieldId, itemId: string, image: string) => {
    setMural((current) => ({ ...current, [field]: current[field].map((item) => item.id === itemId ? { ...item, image } : item) }));
  };
  const removeMuralItem = (field: MuralFieldId, itemId: string) => {
    setMural((current) => ({ ...current, [field]: current[field].filter((item) => item.id !== itemId) }));
  };

  const handleProfileAction = (action: ProfileActionId) => {
    const messages: Record<ProfileActionId, string> = {
      request: "Botão Mandar solicitação pronto para conectar ao sistema de amizades",
      message: "Botão Conversar pronto para conectar ao chat existente",
      report: "Botão Denunciar usuário pronto para conectar ao sistema de denúncias",
    };
    notify(messages[action]);
  };

  const openPlans = () => {
    onClose?.();
    window.dispatchEvent(new CustomEvent('friends-space:show-astro-plans'));
  };

  const enterPreview = () => {
    previewSnapshot.current = { decoration, nameplate, profileFrame, profileEffect, nameColor, nameEffect, astroBadge };
    setPreviewing(true);
    notify("Prévia do ASTRO ativada");
  };

  const exitPreview = () => {
    const snap = previewSnapshot.current;
    if (snap) {
      setDecoration(snap.decoration);
      setNameplate(snap.nameplate);
      setProfileFrame(snap.profileFrame);
      setProfileEffect(snap.profileEffect);
      setNameColor(snap.nameColor);
      setNameEffect(snap.nameEffect);
      setAstroBadge(snap.astroBadge);
    }
    previewSnapshot.current = null;
    setPreviewing(false);
  };

  const surpriseMe = () => {
    const randomOf = (items: CatalogItem[]) => items[Math.floor(Math.random() * items.length)].id;
    setDecoration(randomOf(KIND_CATALOG.avatar.filter((item) => item.id !== "none")));
    setNameplate(randomOf(KIND_CATALOG.nameplate.filter((item) => item.id !== "none")));
    setProfileFrame(randomOf(KIND_CATALOG.frame.filter((item) => item.id !== "none")));
    setProfileEffect(randomOf(KIND_CATALOG.effect.filter((item) => item.id !== "none")));
    const colorItems = NAME_COLORS.filter((item) => item.color);
    setNameColor(colorItems[Math.floor(Math.random() * colorItems.length)].id);
    setNameEffect(Math.random() > 0.5 ? "shine" : "neon");
    setAstroBadge(true);
    notify("Visual surpresa aplicado (prévia)");
  };

  const handleCancel = () => {
    setDisplayName(currentUser?.name || "");
    setUsername(currentUser?.friendCode || "");
    setAbout(currentUser?.bio || "");
    setPhotoUrl(currentUser?.photoUrl || "");
    setBannerUrl(currentUser?.bannerUrl || "");
    setDecoration(settingString(userSettings, "frame", "none"));
    setNameplate(settingString(userSettings, "nameplate", "none"));
    setProfileFrame(settingString(userSettings, "profileFrame", "none"));
    setProfileEffect(settingString(userSettings, "profileEffect", "none"));
    setAccent(currentUser?.accentColor || "#29A3FF");
    setNameColor(settingString(userSettings, "nameColor", "default"));
    setNameEffect((settingString(userSettings, "nameEffect", "none") as NameEffect) || "none");
    setAstroBadge(userSettings.astroBadge !== false);
    setWishlist(parseWishlist(userSettings.wishlist));
    setSelectedTheme(savedAppearance.theme);
    setSelectedFont(savedAppearance.font);
    setSelectedBg(savedAppearance.bg);
    setSelectedTextColor(savedAppearance.textColor);
    setEditingField(null);
    notify("Alterações canceladas");
  };

  const checkUsernameUnique = async (value: string) => {
    if (!value || value === (currentUser?.friendCode || "")) {
      setUsernameError("");
      return true;
    }
    try {
      const { requestBackend } = await import("../../../services/backend");
      const existing = await requestBackend<{ friendCode?: string } | undefined>("findUserByFriendCode", { friendCode: value });
      if (existing && existing.friendCode && existing.friendCode.toUpperCase() === value.toUpperCase()) {
        setUsernameError("Este nome de usuario ja esta em uso");
        return false;
      }
    } catch { }
    setUsernameError("");
    return true;
  };

  const openCrop = async (e: React.ChangeEvent<HTMLInputElement>, kind: "avatar" | "banner") => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      if (file.type === 'image/gif') {
        if (kind === "avatar") setPhotoUrl(dataUrl);
        else setBannerUrl(dataUrl);
        notify("GIF aplicado! Clique em Salvar.");
        e.target.value = "";
        return;
      }
      if (kind === "avatar") {
        setPhotoUrl(dataUrl);
        setCropShape("circle");
        setCropAspect(1);
      } else {
        setBannerUrl(dataUrl);
        setCropShape("rect");
        setCropAspect(3);
      }
      setCropImage(dataUrl);
      e.target.value = "";
    } catch { }
  };

  const handleCropDone = async (dataUrl: string) => {
    try {
      const url = await uploadProfileImage(dataUrl, cropShape === "circle" ? "avatar" : "banner");
      if (cropShape === "circle") setPhotoUrl(url);
      else setBannerUrl(url);
      if (typeof url === "string" && url.startsWith("data:")) {
        notify(getLastDriveError() || "Drive indisponível: prévia local. Clique em Salvar.");
      } else {
        notify("Imagem enviada!");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao enviar imagem");
    }
    setCropImage(null);
  };

  const requestAvatarChange = () => {
    if (!isDriveConnected()) { pendingDriveAction.current = "avatar"; setDriveModal(true); return }
    avatarInputRef.current?.click();
  };

  const requestBannerChange = () => {
    if (!isDriveConnected()) { pendingDriveAction.current = "banner"; setDriveModal(true); return }
    bannerInputRef.current?.click();
  };

  const handleSave = async () => {
    if (!displayName.trim() || !username.trim()) {
      notify("Nome e nome de usuario sao obrigatorios");
      return;
    }
    const unique = await checkUsernameUnique(username);
    if (!unique) return;
    setSaving(true);
    try {
      const withTimeout = async <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => {
        let timer: number | undefined
        try {
          return await Promise.race([
            p,
            new Promise<T>((resolve) => { timer = window.setTimeout(() => resolve(fallback), ms) }),
          ])
        } finally {
          if (timer !== undefined) window.clearTimeout(timer)
        }
      }
      let finalPhotoUrl = photoUrl;
      let finalBannerUrl = bannerUrl;
      if (typeof finalPhotoUrl === "string" && finalPhotoUrl.startsWith("data:image/")) {
        finalPhotoUrl = await withTimeout(uploadProfileImage(finalPhotoUrl, "avatar"), 20000, finalPhotoUrl);
      }
      if (typeof finalBannerUrl === "string" && finalBannerUrl.startsWith("data:image/")) {
        finalBannerUrl = await withTimeout(uploadProfileImage(finalBannerUrl, "banner"), 20000, finalBannerUrl);
      }
      const paidNow = paid;
      const settings: Record<string, unknown> = {
        ...userSettings,
        status: socialStatus,
        statusMessage,
        showActivity,
        showServers,
        showMutualFriends,
        mural,
        muralFields: selectedMuralFields,
        pronoun: typeof userSettings.pronoun === "string" ? userSettings.pronoun : "",
        frame: paidNow ? decoration : "none",
        nameplate: paidNow ? nameplate : "none",
        profileFrame: paidNow ? profileFrame : "none",
        profileEffect: paidNow ? profileEffect : "none",
        nameColor: paidNow ? nameColor : "default",
        nameEffect: paidNow ? nameEffect : "none",
        astroBadge: paidNow ? astroBadge : false,
        wishlist,
        ...serializeAppearance({ theme: selectedTheme as AppearanceThemeId, font: selectedFont as AppearanceFontId, bg: selectedBg as AppearanceBgId, textColor: selectedTextColor }),
      };
      await updateUser({
        name: displayName.trim(),
        friendCode: username.toUpperCase(),
        bio: about.trim(),
        photoUrl: finalPhotoUrl,
        bannerUrl: finalBannerUrl,
        accentColor: accent,
        settings,
      });
      notify("Alterações salvas");
      if (onClose) setTimeout(onClose, 500);
    } catch (e) {
      notify(e instanceof Error && e.message ? e.message : "Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  };

  const currentOf = (kind: CatalogKind) => kind === "avatar" ? decoration : kind === "nameplate" ? nameplate : kind === "frame" ? profileFrame : profileEffect;
  const applyOf = (kind: CatalogKind, id: string) => {
    if (kind === "avatar") setDecoration(id);
    else if (kind === "nameplate") setNameplate(id);
    else if (kind === "frame") setProfileFrame(id);
    else setProfileEffect(id);
  };

  const wishToggle = (item: CatalogItem) => {
    setWishlist((current) => current.some((entry) => entry.kind === item.kind && entry.id === item.id)
      ? current.filter((entry) => !(entry.kind === item.kind && entry.id === item.id))
      : [...current, { kind: item.kind, id: item.id }]);
  };

  const wishItems = wishlist.map((entry) => ({ entry, item: catalogItem(entry.kind, entry.id) }));
  const wishCandidates = ALL_SHOP_ITEMS.filter((item) => !wishlist.some((entry) => entry.kind === item.kind && entry.id === item.id));
  const activityMax = Math.max(...(activity || []).map((entry) => entry.seconds), 1);

  return (
    <div className="fs-profile-editor">
      <div className="ape-overlay">
        <div className="ape-window">
          <button className="ape-close" onClick={onClose} aria-label="Fechar"><X size={15} /></button>

          {/* ── Coluna esquerda ── */}
          <aside className="ape-side">
            {previewing ? (
              <div className="ape-preview-head">
                <button className="ape-preview-back" onClick={exitPreview}><ArrowLeft size={15} />Prévia do ASTRO</button>
                <p>Você está visualizando uma prévia de como seu perfil poderia ficar com o ASTRO.</p>
                <button className="ape-btn ape-btn-light ape-btn-full" onClick={surpriseMe}><Sparkles size={14} />Surpreenda-me!</button>
              </div>
            ) : (
              <div className="ape-side-head">
                <span className="ape-side-title">Perfil principal <ChevronDown size={14} /></span>
                <span className="ape-side-expand"><ChevronsRight size={15} /></span>
              </div>
            )}
            <div className="ape-side-scroll">
              <button className="ape-row" onClick={() => setPicker("nameplate")}>
                <span className="ape-row-text"><span className="ape-row-title">Placa de identificação</span><span className="ape-row-sub">{catalogItem("nameplate", nameplate).name}</span></span>
                <span className="ape-row-tile"><span className={cn("ape-tile-plate", skinClass("nameplate", nameplate))}>{displayName || "Seu nome"}</span></span>
              </button>

              <button className="ape-row" onClick={() => setPicker("avatar")}>
                <span className="ape-row-text"><span className="ape-row-title">Avatar e decorações</span><span className="ape-row-sub">{catalogItem("avatar", decoration).name}</span></span>
                <span className="ape-row-tile">
                  <span className={cn("ape-tile-circle", skinClass("avatar", decoration))}><img src={avatarSrc} alt="Avatar" /></span>
                  <span className="ape-tile-circle ape-tile-add"><Plus size={15} /></span>
                </span>
              </button>

              <div className="ape-color-row">
                <span className="ape-row-text"><span className="ape-row-title">Cor da faixa</span><span className="ape-row-sub">Cor de destaque do perfil</span></span>
                <input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} aria-label="Cor da faixa" />
              </div>

              <button className="ape-row" onClick={() => setPicker("frame")}>
                <span className="ape-row-text"><span className="ape-row-title">Efeitos de perfil e molduras</span><span className="ape-row-sub">Moldura: {catalogItem("frame", profileFrame).name} · Efeito: {catalogItem("effect", profileEffect).name}</span></span>
                <span className="ape-row-tile">
                  <span className={cn("ape-tile-mini", "ape-card", skinClass("frame", profileFrame))}><span className="ape-tile-mini-avatar" /><span className="ape-tile-mini-name" style={{ background: accent }}>{displayName.split(" ")[0] || "Olá"}</span></span>
                  <span className="ape-tile-mini" onClick={(event) => { event.stopPropagation(); setPicker("effect"); }}>
                    <span className="ape-card-fill" />
                    {profileEffect !== "none" && <span className={cn("ape-effect-layer", skinClass("effect", profileEffect))} />}
                  </span>
                </span>
              </button>

              {!previewing && (paid ? (
                <button className="ape-row" onClick={openPlans}>
                  <span className="ape-row-text"><span className="ape-row-title">ASTRO</span><span className="ape-row-sub">Gerenciar assinatura</span></span>
                  <span className="ape-row-tile"><span className="ape-wish-count">{planLabelOf(savedPlan)}</span></span>
                </button>
              ) : (
                <div className="ape-upgrade">
                  <p className="ape-upgrade-title">Eleve seu visual, somente com <b>ASTRO</b></p>
                  <button className="ape-btn ape-btn-light ape-btn-full" onClick={enterPreview}><Sparkles size={14} />Prévia do ASTRO</button>
                  <button className="ape-btn ape-btn-accent ape-btn-full" style={{ marginTop: 6 }} onClick={openPlans}><Rocket size={14} />Obter o ASTRO</button>
                </div>
              ))}

              <button className="ape-row" onClick={() => setPicker("nameStyle")}>
                <span className="ape-row-text"><span className="ape-row-title">Estilo do nome exibido</span><span className="ape-row-sub">Cor, efeito e insígnia</span></span>
                <span className="ape-row-tile">
                  <span className={cn("ape-name-sample", namePreview.className, skinClass("nameplate", nameplate))} style={namePreview.style}>{displayName || "Seu nome"}</span>
                  {renderPaid && astroBadge && <span className="ape-badge-astro"><Rocket size={13} /></span>}
                </span>
              </button>

              <button className="ape-row" onClick={() => setIsAppearanceOpen(true)}>
                <span className="ape-row-text"><span className="ape-row-title">Tema de perfil</span><span className="ape-row-sub">Cores, fonte e fundo</span></span>
                <span className="ape-row-tile">
                  {PLAN_THEMES[savedPlan].slice(0, 2).map((tid) => (
                    <span key={tid} className="ape-tile-thumb" style={{ background: "linear-gradient(135deg, var(--accent), transparent)" }} />
                  ))}
                </span>
              </button>

              <button className="ape-row" onClick={requestBannerChange}>
                <span className="ape-row-text"><span className="ape-row-title">Faixa do perfil</span><span className="ape-row-sub">Banner exibido no topo</span></span>
                <span className="ape-row-tile"><span className="ape-tile-thumb" style={bannerStyle} /></span>
              </button>

              <button className="ape-row" onClick={() => { if (!renderPaid) { notify("Avatar animado é exclusivo do ASTRO"); return; } requestAvatarChange(); }}>
                <span className="ape-row-text"><span className="ape-row-title">Avatar animado</span><span className="ape-row-sub">{renderPaid ? "Use um GIF para animar seu avatar" : "Disponível no ASTRO"}</span></span>
                <span className="ape-row-tile"><span className="ape-tile-circle"><img src={avatarSrc} alt="Avatar" /></span></span>
              </button>
            </div>
            {!previewing && (
              <div className="ape-side-foot">
                <button className="ape-btn ape-btn-ghost" onClick={handleCancel} disabled={saving}>Cancelar</button>
                <button className="ape-btn ape-btn-accent" onClick={() => void handleSave()} disabled={!displayName || !username || saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
              </div>
            )}
          </aside>

          {/* ── Coluna central: cartão ── */}
          <section className="ape-center">
            <div className={cn("ape-card", skinClass("frame", profileFrame))}>
              <div className="ape-card-inner">
                <div className="ape-card-banner" style={bannerStyle} />
                <div className="ape-avatar-wrap">
                  <div className={cn("ape-avatar", skinClass("avatar", decoration))}>
                    <img src={avatarSrc} alt="Avatar" />
                  </div>
                </div>
                <div className="ape-card-body">
                  <div className="ape-card-name-row">
                    <div className="ape-card-name">
                      <span className="ape-name-line">
                        <span className={cn("ape-plate", skinClass("nameplate", nameplate))}>
                          {editingField === "name" ? (
                            <input
                              className="ape-inline-input ape-display-name"
                              style={{ fontSize: 21, fontWeight: 800, marginLeft: 0 }}
                              autoFocus
                              maxLength={20}
                              value={displayName}
                              onChange={(event) => setDisplayName(event.target.value)}
                              onBlur={() => { if (!displayName.trim()) setDisplayName(currentUser?.name || ""); setEditingField(null); }}
                              onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") { setDisplayName(currentUser?.name || ""); setEditingField(null); } }}
                            />
                          ) : (
                            <span className={cn("ape-display-name", namePreview.className)} style={namePreview.style} onClick={() => setEditingField("name")}>{displayName || "Seu nome"}</span>
                          )}
                        </span>
                        {editingField === "name" && <span className="ape-inline-count">{displayCount}</span>}
                        {renderPaid && astroBadge && <span className="ape-badge-astro"><Rocket size={16} /></span>}
                      </span>
                      <span className="ape-handle-line">
                        {editingField === "username" ? (
                          <input
                            className="ape-inline-input"
                            style={{ fontSize: 13 }}
                            autoFocus
                            maxLength={20}
                            value={username}
                            onChange={(event) => { setUsername(event.target.value.toUpperCase()); setUsernameError(""); }}
                            onBlur={() => { if (!username.trim()) setUsername(currentUser?.friendCode || ""); setEditingField(null); }}
                            onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") { setUsername(currentUser?.friendCode || ""); setEditingField(null); } }}
                          />
                        ) : (
                          <span className="ape-handle" onClick={() => setEditingField("username")}>@{username || "usuario"}</span>
                        )}
                        {editingField === "username" && <span className="ape-inline-count">{usernameCount}</span>}
                        {editingField === "username" && usernameError && <span className="ape-inline-error">{usernameError}</span>}
                        {!userSettings.pronoun && editingField !== "username" && <span style={{ color: "var(--text-muted)", fontSize: 12 }}>· <span style={{ cursor: "pointer" }} onClick={() => notify("Pronomes chegam em breve")}>Adicionar pronomes</span></span>}
                      </span>
                    </div>
                  </div>
                  <p className="ape-edit-hint"><Pencil size={11} />Clique no nome, @usuário ou bio para editar.</p>

                  {infoBoxOpen && (
                    <div className="ape-info-box" style={{ marginTop: 12 }}>
                      <Info size={15} style={{ flex: "0 0 auto", marginTop: 1, color: "var(--accent)" }} />
                      <span>Seu perfil completo está sendo compartilhado apenas com seus amigos. Gerencie suas <b onClick={() => setIsSocialOpen(true)}>configurações de privacidade</b> a qualquer momento.</span>
                      <button className="ape-info-close" onClick={() => setInfoBoxOpen(false)} aria-label="Fechar aviso"><X size={13} /></button>
                    </div>
                  )}

                  <div className="ape-block-label">Sobre mim</div>
                  {editingField === "about" ? (
                    <textarea
                      className="ape-about-input"
                      autoFocus
                      maxLength={190}
                      value={about}
                      onChange={(event) => setAbout(event.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(event) => { if (event.key === "Escape") { setAbout(currentUser?.bio || ""); setEditingField(null); } }}
                      placeholder="Descreva-se em três emojis"
                    />
                  ) : (
                    <p className={cn("ape-about", !about && "is-empty")} onClick={() => setEditingField("about")}>{about || "Descreva-se em três emojis"}</p>
                  )}

                  <div className="ape-block-label">Membro desde</div>
                  <p className="ape-member-since" style={{ margin: 0 }}>{memberSince}</p>
                </div>
                {profileEffect !== "none" && renderPaid && <span className={cn("ape-effect-layer", skinClass("effect", profileEffect))} />}
              </div>
            </div>
          </section>

          {/* ── Coluna direita: abas ── */}
          <main className="ape-main">
            <div className="ape-tabs">
              <button className={cn("ape-tab", tab === "mural" && "active")} onClick={() => setTab("mural")}>Mural</button>
              <button className={cn("ape-tab", tab === "activity" && "active")} onClick={() => setTab("activity")}>Atividade</button>
              <button className={cn("ape-tab", tab === "wishlist" && "active")} onClick={() => setTab("wishlist")}>Lista de desejos</button>
            </div>
            <div className="ape-tab-body">
              {tab === "mural" && (
                <>
                  <div className="ape-mural-lead">
                    <h3>Personalize seu perfil com widgets</h3>
                    <p>Explore nossa biblioteca de widgets para compartilhar mais sobre você e seus interesses.</p>
                  </div>
                  <div className="ape-widget-grid">
                    {MURAL_FIELD_DEFS.map((definition) => {
                      const selected = selectedMuralFields.includes(definition.id);
                      return (
                        <button key={definition.id} className={cn("ape-widget", selected && "selected")} onClick={() => toggleMuralField(definition.id)}>
                          <img src={definition.image} alt="" loading="lazy" />
                          <span className="ape-widget-label">{definition.label}</span>
                          <span className="ape-widget-mark">{selected ? "✓" : "+"}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedMuralFields.length > 0 && (
                    <div className="ape-mural-selected">
                      {selectedMuralFields.map((field) => {
                        const definition = MURAL_FIELD_DEFS.find((item) => item.id === field)!;
                        return (
                          <MuralCategoryEditor
                            key={field}
                            definition={definition}
                            items={mural[field]}
                            onAdd={() => addMuralItem(field)}
                            onAutoFill={field === "recentGames" ? () => void fillRecentFromActivity() : undefined}
                            onChange={(itemId, value) => updateMuralItem(field, itemId, value)}
                            onImageChange={(itemId, image) => updateMuralImage(field, itemId, image)}
                            onRemove={(itemId) => removeMuralItem(field, itemId)}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {tab === "activity" && (
                <>
                  <div className="ape-wish-head"><span className="ape-wish-count">Atividade recente</span></div>
                  <p className="ape-activity-lead">Você verá sua atividade dos últimos 30 dias aqui. <b>Saiba mais</b></p>
                  {activity === null ? null : activity.length === 0 ? (
                    <p className="ape-wish-empty">Sem atividade registrada nos últimos 7 dias (só no app desktop).</p>
                  ) : (
                    <div className="ape-activity-list">
                      {activity.map((entry, index) => (
                        <div className="ape-activity-row" key={`${entry.app}-${index}`}>
                          <span className="ape-activity-icon">{entry.app.slice(0, 1).toUpperCase()}</span>
                          <div className="ape-activity-info">
                            <b>{entry.app}</b>
                            <span>{formatSeconds(entry.seconds)}</span>
                            <div className="ape-activity-bar"><i style={{ width: `${Math.max(6, Math.round((entry.seconds / activityMax) * 100))}%` }} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === "wishlist" && (
                <>
                  <div className="ape-muted-note"><Info size={14} />Apenas seus amigos poderão ver o conteúdo nesta aba</div>
                  <div className="ape-wish-head">
                    <span className="ape-wish-count">{wishlist.length} {wishlist.length === 1 ? "item" : "itens"}</span>
                    <span className="ape-spacer" />
                    <select className="ape-select" value="" onChange={(event) => {
                      const [kind, id] = event.target.value.split(":");
                      if (kind && id) wishToggle(catalogItem(kind as CatalogKind, id));
                    }}>
                      <option value="">Adicionar item</option>
                      {(["nameplate", "avatar", "frame", "effect"] as CatalogKind[]).map((kind) => {
                        const options = wishCandidates.filter((item) => item.kind === kind);
                        if (!options.length) return null;
                        return (
                          <optgroup key={kind} label={KIND_LABEL[kind]}>
                            {options.map((item) => <option key={`${kind}:${item.id}`} value={`${kind}:${item.id}`}>{item.name}</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                  {wishItems.length === 0 ? (
                    <p className="ape-wish-empty">Sua lista de desejos está vazia. Adicione itens da loja para não esquecê-los.</p>
                  ) : (
                    <div className="ape-wish-grid">
                      {wishItems.map(({ entry, item }) => (
                        <div className="ape-wish-card" key={`${entry.kind}:${entry.id}`}>
                          <button className="ape-wish-action" onClick={() => wishToggle(item)} aria-label={`Remover ${item.name}`}><X size={12} /></button>
                          <span className="ape-wish-thumb"><SkinThumb kind={entry.kind} id={entry.id} /></span>
                          <span className="ape-wish-name">{item.name} · {KIND_LABEL[entry.kind]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <h4 className="ape-picker-section">Itens sugeridos para você</h4>
                  <div className="ape-wish-grid">
                    {wishCandidates.map((item) => (
                      <div className="ape-wish-card" key={`${item.kind}:${item.id}`}>
                        <button className="ape-wish-action" onClick={() => wishToggle(item)} aria-label={`Adicionar ${item.name}`}><Plus size={12} /></button>
                        <span className="ape-wish-thumb"><SkinThumb kind={item.kind} id={item.id} /></span>
                        <span className="ape-wish-name">{item.name} · {KIND_LABEL[item.kind]}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </main>

          {previewing && (
            <div className="ape-preview-bar">
              <p>Você está visualizando uma prévia de como seu perfil poderia ficar com o ASTRO.</p>
              <button className="ape-btn ape-btn-ghost" onClick={exitPreview}>Sair da prévia</button>
              <button className="ape-btn ape-btn-accent" onClick={openPlans}><Rocket size={14} />Obter o ASTRO</button>
            </div>
          )}
        </div>

      {picker && picker !== "nameStyle" && (
        <CatalogPicker
          kind={picker}
          current={currentOf(picker)}
          plan={savedPlan}
          previewing={previewing}
          displayName={displayName}
          username={username}
          avatarSrc={avatarSrc}
          bannerStyle={bannerStyle}
          decoration={decoration}
          nameplate={nameplate}
          frame={profileFrame}
          effect={profileEffect}
          nameStyle={namePreview.style}
          nameClassName={namePreview.className}
          badge={renderPaid && astroBadge}
          onApply={(id) => applyOf(picker, id)}
          onClose={() => setPicker(null)}
          onLocked={(item) => notify(`${item.name} — ${item.detail}. Assine o ASTRO para desbloquear.`)}
        />
      )}

      {picker === "nameStyle" && (
        <NameStylePicker
          currentColor={nameColor}
          currentEffect={nameEffect}
          currentBadge={astroBadge}
          paid={paid}
          previewing={previewing}
          displayName={displayName}
          onApply={(color, effect, badge) => { setNameColor(color); setNameEffect(effect); setAstroBadge(badge); }}
          onClose={() => setPicker(null)}
          onLocked={() => notify("Estilos de nome são exclusivos do ASTRO. Ative a prévia para experimentar.")}
        />
      )}

      {isSocialOpen && <SocialSettingsModal plan={savedPlan} displayName={displayName} username={username} about={about} selectedFrame={decoration as FrameId} status={socialStatus} onStatusChange={setSocialStatus} statusMessage={statusMessage} onStatusMessageChange={setStatusMessage} showActivity={showActivity} setShowActivity={setShowActivity} showServers={showServers} setShowServers={setShowServers} showMutualFriends={showMutualFriends} setShowMutualFriends={setShowMutualFriends} mural={mural} selectedMuralFields={selectedMuralFields} onMuralFieldToggle={toggleMuralField} onMuralItemAdd={addMuralItem} onMuralAutoFill={() => void fillRecentFromActivity()} onMuralItemChange={updateMuralItem} onMuralImageChange={updateMuralImage} onMuralItemRemove={removeMuralItem} onClose={() => setIsSocialOpen(false)} onNotify={notify} onViewProfile={() => setIsPublicProfileOpen(true)} onProfileAction={handleProfileAction} />}

      {isPublicProfileOpen && <PublicProfileModal plan={renderPlan} displayName={displayName} username={username} about={about} socialStatus={socialStatus} statusMessage={statusMessage} showActivity={showActivity} showServers={showServers} showMutualFriends={showMutualFriends} mural={mural} selectedMuralFields={selectedMuralFields} selectedFrame={decoration as FrameId} photoUrl={photoUrl ? imgSrc(photoUrl, 512) : undefined} bannerUrl={bannerUrl ? imgSrc(bannerUrl, 1200) : undefined} isSelf joinedAt={Number(currentUser?.createdAt || 0)} verified={Boolean((currentUser?.googleId || currentUser?.authProvider === "google") && userSettings.showBadges !== false)} activity={showActivity && currentUser?.activityName ? { name: currentUser.activityName, details: currentUser.activityDetails, startedAt: currentUser.activityStartedAt } : undefined} nameplateId={nameplate} profileFrameId={profileFrame} profileEffectId={profileEffect} nameColorId={nameColor} nameEffectId={nameEffect} showAstroBadge={renderPaid && astroBadge} onClose={() => setIsPublicProfileOpen(false)} onProfileAction={handleProfileAction} />}

      {isAppearanceOpen && (
        <div className="appearance-modal-overlay" onClick={() => setIsAppearanceOpen(false)}>
          <div className="appearance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="appearance-modal-header">
              <h3><Sparkles size={16} /> Editar Aparência do Perfil</h3>
              <button onClick={() => setIsAppearanceOpen(false)}><X size={16} /></button>
            </div>
            <div className="appearance-modal-body">
              <div className="appearance-live-preview" style={{ fontFamily: APPEARANCE_FONTS[selectedFont as AppearanceFontId] ?? APPEARANCE_FONTS.space }}>
                <span className="appearance-live-preview-label">Preview das cores</span>
                <div className="appearance-live-preview-text" style={{ color: APPEARANCE_TEXT_COLORS[selectedTextColor] === "inherit" ? "#eef3f4" : APPEARANCE_TEXT_COLORS[selectedTextColor] }}>
                  Olá, eu sou {displayName || "você"}! 🚀 Este texto muda com a <b>Cor das letras</b>.
                </div>
              </div>
              <div className="appearance-group">
                <label>Tema de Cores ({savedPlan.toUpperCase()})</label>
                <div className="appearance-options-grid">
                  {PLAN_THEMES[savedPlan].map((tid) => (
                    <button
                      key={tid}
                      className={selectedTheme === tid ? "selected" : ""}
                      onClick={() => {
                        setSelectedTheme(tid);
                        notify(tid === "default" ? "Tema Padrão aplicado" : "Tema Branco aplicado");
                      }}
                    >
                      {tid === "default" ? "Padrão" : "Branco"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="appearance-group">
                <label>Fonte de Letra</label>
                <div className="appearance-options-grid">
                  {[
                    ["space", "Space Grotesk"], ["inter", "Inter"], ["mono", "Monospace"],
                    ["poppins", "Poppins"], ["montserrat", "Montserrat"], ["outfit", "Outfit"],
                    ["roboto", "Roboto"], ["playfair", "Playfair Display"], ["jetbrains", "JetBrains Mono"],
                  ].map(([id, label]) => (
                    <button key={id} className={selectedFont === id ? "selected" : ""} onClick={() => { setSelectedFont(id); notify(`Fonte ${label} aplicada`); }}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="appearance-group">
                <label>Cor das letras</label>
                <p className="appearance-helper-text">Esta configuração é independente da fonte e altera somente as cores dos textos no preview.</p>
                <div className="appearance-color-grid">
                  {([
                    ["default", "Padrão", "#94a3b8"], ["white", "Branco", "#f8fafc"], ["silver", "Prata", "#cbd5e1"],
                    ["green", "Verde", "#86efac"], ["blue", "Azul", "#93c5fd"], ["pink", "Rosa", "#f9a8d4"],
                    ["yellow", "Amarelo", "#fde68a"], ["purple", "Roxo", "#d8b4fe"], ["gold", "Dourado", "#f7d774"],
                  ] as [AppearanceTextColorId, string, string][]).map(([id, label, color]) => (
                    <button key={id} className={selectedTextColor === id ? "selected" : ""} onClick={() => { setSelectedTextColor(id); notify(`Cor ${label} aplicada`); }}>
                      <span className="appearance-color-swatch" style={{ background: color }} />{label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="appearance-group">
                <label>Plano de Fundo (Background)</label>
                <div className="appearance-options-grid">
                  {PLAN_BACKGROUNDS[savedPlan].map((bid) => (
                    <button
                      key={bid}
                      className={selectedBg === bid ? "selected" : ""}
                      onClick={() => {
                        setSelectedBg(bid);
                        notify(bid === "default" ? "Fundo Padrão aplicado" : "Fundo Branco aplicado");
                      }}
                    >
                      {bid === "default" ? "Padrão" : "Branco"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="appearance-modal-footer">
              <button onClick={() => setIsAppearanceOpen(false)}>Concluir</button>
            </div>
          </div>
        </div>
      )}

      <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => openCrop(e, "avatar")} />
      <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => openCrop(e, "banner")} />

      {status && <div className="toast-status"><Sparkles size={14} />{status}</div>}
      {cropImage && <ImageCropper image={cropImage} shape={cropShape} aspectRatio={cropAspect} onCrop={(dataUrl) => void handleCropDone(dataUrl)} onCancel={() => setCropImage(null)} />}
      <DriveRequiredModal
        open={driveModal}
        variant="perfil"
        onClose={() => setDriveModal(false)}
        onConnected={() => {
          setDriveModal(false);
          if (pendingDriveAction.current === "banner") requestBannerChange();
          else requestAvatarChange();
        }}
      />
      </div>
    </div>
  );
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}
