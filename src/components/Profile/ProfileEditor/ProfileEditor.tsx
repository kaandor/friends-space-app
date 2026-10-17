import { useEffect, useMemo, useRef, useState } from "react";
import { APPEARANCE_FONTS, APPEARANCE_TEXT_COLORS, appearanceDataAttrs, appearanceStyle, clampAppearanceToPlan, parseAppearance, serializeAppearance, PLAN_THEMES, PLAN_BACKGROUNDS, type AppearanceBgId, type AppearanceFontId, type AppearanceTextColorId, type AppearanceThemeId } from "./appearance";
import { useUserStore } from "../../../stores/userStore";
import { getAstroTier, type AstroTier } from "../../../utils/astro";
import { ImageCropper } from "../../ui/ImageCropper";
import { uploadProfileImage, isDriveConnected, toImageUrl, getLastDriveError } from "../../../services/driveService";
import { DriveRequiredModal } from "../../Chat/DriveRequiredModal";
import "./ProfileEditor.css";
import {
  Check,
  ChevronLeft,
  CircleDot,
  CircleUserRound,
  Eye,
  Image,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "./cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// STYLE NOTE: The crop supports four deliberate states: Free, ASTRO, ASTRO+, and ASTRO PLUS.
// ASTRO owns emerald surfaces; ASTRO+ owns violet surfaces; ASTRO PLUS owns gold/amber surfaces.
// Keep every tier distinct in media, resource copy, controls, comparisons, and save/management actions.

const ASSETS = {
  avatar: "/manus-storage/free-avatar-500x500_fe125bff.svg",
  astroAvatar: "/manus-storage/astro-avatar-500x500_ed79d9c1.svg",
  astroCardBanner: "/manus-storage/astro-plan-header_53ad0a08.svg",
  astroPlusCardHeader: "/manus-storage/astro-plus-tier-header_f4443ccd.svg",
  astroPlusGoldCardHeader: "/manus-storage/astro-plus-gold-header_f9c03b66.svg",
  freeCardHeader: "/manus-storage/free-plan-header_8051f2a6.svg",
  texture: "/manus-storage/friends-space-texture_39554b97.svg",
  freeAvatar: "/manus-storage/free-avatar-500x500_fe125bff.svg",
  freePlanIcon: "/manus-storage/free-plan-header_8051f2a6.svg",
  freeBanner: "/manus-storage/free-clean-banner_73058eb2.svg",
  astroBanner: "/manus-storage/friends-space-astro-banner-hd-green_8f8db9a4.svg",
  astroPlusBanner: "/manus-storage/friends-space-astro-plus-banner-hd_25eb679b.svg",
  astroPlusGoldBanner: "/manus-storage/friends-space-astro-plus-gold-banner-hd_bba7b14d.svg",
  astroPlusAvatar: "/manus-storage/astro-plus-avatar-500x500_cbcb0ba6.svg",
  astroPlusGoldAvatar: "/manus-storage/astro-plus-gold-avatar-500x500_e0ab7cf3.svg",
};

export type Plan = "free" | "astro" | "astroPlus" | "astroPlusGold";
export type SocialStatus = "online" | "away" | "dnd" | "invisible";
export type ProfileActionId = "request" | "message" | "report";

export type MuralFieldId = "games" | "completedGames" | "recentGames" | "series" | "movies" | "music" | "albums" | "artists" | "actors";
export type MuralItem = { id: string; value: string; image: string };
export type MuralState = Record<MuralFieldId, MuralItem[]>;

export type FrameId = "none" | "pulsar" | "aurora" | "nebulosa" | "estelar" | "supernova" | "galaxia" | "infinito";

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

const FRAME_SHOP_OPTIONS: Array<{ id: FrameId; name: string; note: string; plans: Plan[] }> = [
  { id: "none", name: "Nenhuma", note: "Sem moldura", plans: ["free", "astro", "astroPlus", "astroPlusGold"] },
  { id: "pulsar", name: "Pulsar", note: "ASTRO", plans: ["astro", "astroPlus", "astroPlusGold"] },
  { id: "aurora", name: "Aurora", note: "ASTRO+", plans: ["astroPlus", "astroPlusGold"] },
  { id: "nebulosa", name: "Nebulosa", note: "ASTRO+", plans: ["astroPlus", "astroPlusGold"] },
  { id: "estelar", name: "Estelar", note: "ASTRO+", plans: ["astroPlus", "astroPlusGold"] },
  { id: "supernova", name: "Supernova", note: "ASTRO+", plans: ["astroPlus", "astroPlusGold"] },
  { id: "galaxia", name: "Galáxia", note: "ASTRO+", plans: ["astroPlus", "astroPlusGold"] },
  { id: "infinito", name: "Infinito", note: "ASTRO PLUS", plans: ["astroPlusGold"] },
];

const freeFeatures = [
  "Editar nome de exibição",
  "Editar nome de usuário (1 vez)",
  "Adicionar amigos",
  "Participar de servidores",
  "Enviar mensagens",
  "Upload de arquivos até 25 MB",
  "Streaming em 720p / 30 FPS",
  "Streaming em 420p / 30 FPS",
];

const astroFeatures = [
  "Editar nome de exibição",
  "Editar nome de usuário",
  "Adicionar sobre você",
  "Banner personalizado",
  "Avatar animado",
  "Emojis exclusivos",
  "Mais espaço para o “Sobre mim”",
  "Plano de fundo do perfil",
  "Acesso antecipado a alguns recursos",
];

const astroPlusFeatures = [
  "Editar nome de exibição",
  "Editar nome de usuário",
  "Adicionar sobre você",
  "Banner personalizado",
  "Avatar animado",
  "Molduras premium",
  "Nome com efeito animado",
  "Efeitos exclusivos de perfil",
  "Upload de arquivos até 1 GB",
  "Streaming em 2K / 30 FPS",
  "Compartilhamento de tela em alta qualidade",
];

const astroPlusGoldFeatures = [
  "Tudo do plano ASTRO+",
  "Insígnia ASTRO Plus",
  "Upload de arquivos até 5 GB",
  "Streaming em 2K / 60 FPS",
  "Perfil totalmente personalizável",
  "Nome com efeito animado",
  "Efeitos exclusivos em mensagens",
  "Todas as molduras premium",
  "Insígnias exclusivas por tempo de assinatura",
  "Prioridade no acesso a recursos experimentais",
];

const astroPlusTierComparisons = [
  ["Upload de arquivos", "Até 1 GB", "Até 5 GB"],
  ["Streaming (qualidade)", "2K / 30 FPS", "2K / 60 FPS"],
  ["Compartilhamento de tela", "Maior qualidade", "Qualidade máxima"],
  ["Biblioteca de temas", "Ampliada", "Expandida"],
  ["Moldura premium", "Disponível", "Todas disponíveis"],
  ["Recursos Beta", "Acesso limitado", "Prioridade máxima"],
  ["Acesso a novos recursos", "Antecipado", "Prioridade máxima"],
];

const astroPlusGoldComparisons = [
  ["Upload de arquivos", "Até 5 GB"],
  ["Streaming (qualidade)", "2K / 60 FPS"],
  ["Banner personalizado", "Disponível"],
  ["Avatar animado", "Disponível"],
  ["Molduras e efeitos", "Disponível"],
  ["Emojis exclusivos", "Disponível"],
  ["Insígnias exclusivas", "Disponível"],
  ["Recursos antecipados", "Disponível"],
];

const astroPlusTierLockedFeatures = [
  "Biblioteca de temas expandida",
  "Efeitos exclusivos em mensagens",
  "Acesso Beta a recursos",
  "Recursos ultra exclusivos",
];

const astroPlusGoldLockedFeatures = [
  "Biblioteca de temas expandida",
  "Efeitos exclusivos em mensagens",
  "Acesso Beta a recursos",
  "Recursos ultra exclusivos",
];

const freePremiumFeatures = [
  "Molduras e efeitos premium",
  "Emojis exclusivos",
  "Avatar animado",
  "Insígnias exclusivas",
  "Recursos antecipados",
  "Acesso aos recursos Beta",
  "Upload de arquivos maior que 25 MB",
  "Streaming em qualidade superior",
];



const astroComparisons = [
  ["Upload de arquivos", "Até 250 MB", "Até 1 GB"],
  ["Streaming", "1080p / 60 FPS", "2K / 30 FPS"],
  ["Compartilhamento de tela", "Padrão", "Maior qualidade"],
  ["Biblioteca de temas", "Padrão", "Ampliada"],
  ["Moldura premium", "Não disponível", "Disponível"],
  ["Recursos Beta", "Acesso limitado", "Acesso completo"],
  ["Acesso a novos recursos", "Somente alguns", "Acesso antecipado"],
];

function SectionTitle({ icon: Icon, title, description, tone = "green" }: { icon: typeof Image; title: string; description?: string; tone?: "green" | "neutral" }) {
  return (
    <div className="section-title">
      <Icon className={cn("section-title-icon", tone === "neutral" && "section-title-icon-neutral")} size={17} strokeWidth={1.9} />
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}

function ProfilePhoto({ plan, onNotify, selectedFrame, photoUrl, onEditPhoto, onRemovePhoto }: { plan: Plan; onNotify: (message: string) => void; selectedFrame: FrameId; photoUrl?: string; onEditPhoto?: () => void; onRemovePhoto?: () => void }) {
  const isPaid = plan !== "free";
  const isAstroPlusTier = plan === "astroPlus";
  const isAstroPlusGold = plan === "astroPlusGold";
  const defaultAvatar = plan === "free" ? ASSETS.freeAvatar : plan === "astro" ? ASSETS.astroAvatar : plan === "astroPlus" ? ASSETS.astroPlusAvatar : ASSETS.astroPlusGoldAvatar;
  const currentAvatar = photoUrl || defaultAvatar;
  const avatarSrc = toImageUrl(currentAvatar);
  return (
    <section className={cn("profile-photo-section", isPaid && "astro-photo-section", isAstroPlusTier && "astro-plus-tier-photo-section", isAstroPlusGold && "astro-plus-photo-section")}>
      <SectionTitle icon={CircleUserRound} title="Foto de perfil" description="PNG, JPG ou WEBP. Recomendado: 500x500px. Máx. 5MB." tone="neutral" />
      <div className={cn("profile-avatar-large", isPaid && "astro-avatar-large", isAstroPlusTier && "astro-plus-tier-avatar-large", isAstroPlusGold && "astro-plus-avatar-large", `profile-frame-${selectedFrame}`)}>
        <img src={avatarSrc} alt="Sua foto de perfil" />
        {isPaid ? (
          <button className={cn("astro-avatar-edit", isAstroPlusTier && "astro-plus-tier-avatar-edit", isAstroPlusGold && "astro-plus-avatar-edit")} aria-label="Editar foto de perfil" onClick={onEditPhoto}><Pencil size={14} /></button>
        ) : (
          <span className="free-avatar-lock"><LockKeyhole size={15} /></span>
        )}
      </div>
      {isPaid ? (
        <button className="remove-media-button" onClick={onRemovePhoto}><Trash2 size={12} />Remover foto</button>
      ) : (
        <p className="photo-note">Imagem padrão do Friends Space.<br /><button onClick={() => onNotify("O avatar personalizado está disponível no ASTRO")}>Disponível no <b>ASTRO</b>.</button></p>
      )}
    </section>
  );
}

function AboutSection({ plan, about, setAbout }: { plan: Plan; about: string; setAbout: (value: string) => void }) {
  const isPaid = plan !== "free";
  const isAstroPlusTier = plan === "astroPlus";
  const isAstroPlusGold = plan === "astroPlusGold";
  return (
    <section className={cn("about-section", isPaid && "astro-about-section", isAstroPlusTier && "astro-plus-tier-about-section", isAstroPlusGold && "astro-plus-about-section")}>
      <SectionTitle icon={ShieldCheck} title="Sobre você" description="Conte um pouco sobre você." />
      <label className="control-label about-label">Sobre mim
        <textarea maxLength={120} value={about} onChange={(event) => setAbout(event.target.value)} placeholder="Fale sobre você..." />
        <small className="about-counter">{about.length}/120</small>
      </label>
    </section>
  );
}

function PremiumUnavailable() {
  return (
    <section className="premium-card" style={{ backgroundImage: `linear-gradient(rgba(15,19,23,.94), rgba(15,19,23,.94)), url(${ASSETS.texture})` }}>
      <h2>Recursos premium indisponíveis no plano Gratuito</h2>
      <div className="premium-grid">
        {freePremiumFeatures.map((feature) => (
          <Tooltip key={feature}>
            <TooltipTrigger asChild>
              <button className="premium-item premium-item-hint" type="button">
                <LockKeyhole size={13} strokeWidth={1.8} /><span>{feature}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="tier-tooltip" side="top">Disponível ao assinar o plano ASTRO ou superior.</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </section>
  );
}

function LockedFeatureRow({ feature, targetLabel }: { feature: string; targetLabel: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li className="locked-feature-hint"><LockKeyhole size={13} />{feature}</li>
      </TooltipTrigger>
      <TooltipContent className="tier-tooltip" side="top">Recurso reservado para o {targetLabel}. Toque para saber mais.</TooltipContent>
    </Tooltip>
  );
}

function AstroDecorations({ selectedFrame, onFrameSelect, onOpenFrames, onUpgrade }: { selectedFrame: FrameId; onFrameSelect: (frame: FrameId) => void; onOpenFrames: () => void; onUpgrade: () => void }) {
  void selectedFrame; void onFrameSelect; void onOpenFrames; void onUpgrade;
    void selectedFrame; void onFrameSelect; void onOpenFrames; void onUpgrade;
  return (
    <section className="decorations-section">
      <SectionTitle icon={Sparkles} title="Decorações e molduras" description="Em breve — estamos preparando novidades." />
      <div className="decoration-strip">
        <div className="decoration-item" style={{ cursor: 'default', borderStyle: 'dashed' }}>
          <span className="decoration-empty"><Sparkles size={20} /></span>
          <b>Em breve</b>
        </div>
      </div>
    </section>
  );
}

function AstroPlusTierDecorations({ selectedFrame, onFrameSelect, onOpenFrames, onUpgrade, onNotify }: { selectedFrame: FrameId; onFrameSelect: (frame: FrameId) => void; onOpenFrames: () => void; onUpgrade: () => void; onNotify: (message: string) => void }) {
  void selectedFrame; void onFrameSelect; void onOpenFrames; void onUpgrade; void onNotify;
    void selectedFrame; void onFrameSelect; void onOpenFrames; void onUpgrade; void onNotify;
  return (
    <section className="decorations-section">
      <SectionTitle icon={Sparkles} title="Decorações e molduras" description="Em breve — estamos preparando novidades." />
      <div className="decoration-strip">
        <div className="decoration-item" style={{ cursor: 'default', borderStyle: 'dashed' }}>
          <span className="decoration-empty"><Sparkles size={20} /></span>
          <b>Em breve</b>
        </div>
      </div>
    </section>
  );
}

function AstroPlusUnavailable({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <section className="astro-plus-lock">
      <div><LockKeyhole size={17} /><span><b>Molduras exclusivas disponíveis no ASTRO+</b><small>Assine o ASTRO+ para desbloquear molduras animadas e efeitos premium.</small></span></div>
      <button onClick={onUpgrade}>Assinar ASTRO+</button>
    </section>
  );
}

function AstroPlusGoldUnavailable({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <section className="astro-plus-gold-lock">
      <div><LockKeyhole size={17} /><span><b>Recursos ultra exclusivos disponíveis no ASTRO PLUS</b><small>Faça upgrade para liberar todas as molduras, efeitos e prioridades premium.</small></span></div>
      <button onClick={onUpgrade}>Assinar ASTRO PLUS</button>
    </section>
  );
}

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
        // Séries/atores: TVMaze (grátis, sem chave, com pôsteres). Músicas,
        // filmes e jogos: iTunes Search (sem chave). IMDb/TMDB exigem API key.
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
        // Guarda anti-loop: so atualiza se a capa MUDOU (onImageChange muda de
        // identidade a cada render do pai e re-dispararia o efeito pra sempre).
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

function ProfilePreview({ plan, displayName, username, about, socialStatus, statusMessage, showActivity, showServers, showMutualFriends, mural, selectedMuralFields, selectedFrame, onViewProfile, onProfileAction }: {
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
  const planLabel = plan === "astroPlusGold" ? "ASTRO PLUS" : plan === "astroPlus" ? "ASTRO+" : plan === "astro" ? "ASTRO" : "GRATUITO";
  const statusMeta: Record<SocialStatus, { label: string; color: string }> = {
    online: { label: "Online", color: "#22c55e" },
    away: { label: "Ausente", color: "#f59e0b" },
    dnd: { label: "Não Perturbe", color: "#ef4444" },
    invisible: { label: "Invisível", color: "#94a3b8" },
  };
  const visibleMural = MURAL_FIELD_DEFS.filter((definition) => selectedMuralFields.includes(definition.id));
  const avatar = plan === "free" ? ASSETS.freeAvatar : plan === "astro" ? ASSETS.astroAvatar : plan === "astroPlus" ? ASSETS.astroPlusAvatar : ASSETS.astroPlusGoldAvatar;
  return (
    <section className={cn("profile-preview-section", plan === "astro" && "astro-profile-preview", plan === "astroPlus" && "astro-plus-tier-profile-preview", plan === "astroPlusGold" && "astro-plus-gold-profile-preview")}>
      <div className="profile-preview-heading">
        <div><span className="profile-preview-kicker">VISUALIZAÇÃO EM TEMPO REAL</span><h2>Preview do perfil</h2><p>Veja como suas escolhas aparecem para outras pessoas.</p></div>
        <div className="profile-preview-heading-actions"><span className="profile-preview-plan">{planLabel}</span><button className="profile-preview-view-button" type="button" onClick={onViewProfile}><Eye size={12} />Ver perfil</button></div>
      </div>
      <div className="profile-preview-card">
        <div className="profile-preview-cover" />
        <div className={cn("profile-preview-avatar", `profile-frame-${selectedFrame}`)}><img src={avatar} alt="Prévia do avatar" /></div>
        <div className="profile-preview-content">
          <div className="profile-preview-name-row"><div><h3>{displayName || "Seu nome"}</h3><p>@{username || "usuario"}</p></div><span className="profile-preview-status"><i style={{ background: statusMeta[socialStatus].color }} />{statusMeta[socialStatus].label}</span></div>
          {statusMessage && <p className="profile-preview-message">“{statusMessage}”</p>}
          {about && <p className="profile-preview-about">{about}</p>}
          <div className="profile-preview-meta"><span><b>{showActivity ? "Atividade visível" : "Atividade oculta"}</b></span><span>{showServers ? "Servidores em comum" : "Servidores privados"}</span><span>{showMutualFriends ? "Amigos em comum" : "Amigos privados"}</span></div>
          <div className="profile-preview-actions" aria-label="Ações do perfil"><button type="button" className="profile-action-button primary" onClick={() => onProfileAction("request")}><UserPlus size={13} />Mandar solicitação</button><button type="button" className="profile-action-button" onClick={() => onProfileAction("message")}><MessageCircle size={13} />Conversar</button><button type="button" className="profile-action-button danger" onClick={() => onProfileAction("report")}><ShieldCheck size={13} />Denunciar usuário</button></div>
          <div className="profile-mural-preview">
            <div className="profile-mural-header"><div><span className="profile-preview-kicker">MURAL</span><h4>Preferências de {displayName || "seu perfil"}</h4></div><Sparkles size={15} /></div>
            <div className="profile-mural-list">{visibleMural.length ? visibleMural.flatMap(({ id, label, fallback }) => (mural[id] || []).map((item) => <article className="profile-mural-widget" key={item.id}><img src={item.image} alt={`Imagem de ${item.value || label}`} /><div><span>{label}</span><strong>{item.value.trim() || fallback}</strong></div></article>)) : <p className="profile-mural-empty">Selecione categorias para montar seu Mural.</p>}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FramesShopModal({ plan, selectedFrame, onSelect, onClose, onNotify }: { plan: Plan; selectedFrame: FrameId; onSelect: (frame: FrameId) => void; onClose: () => void; onNotify: (message: string) => void }) {
  const planLabel = plan === "astroPlusGold" ? "ASTRO PLUS" : plan === "astroPlus" ? "ASTRO+" : plan === "astro" ? "ASTRO" : "GRATUITO";
  return (
    <div className="frames-shop-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="frames-shop-modal" role="dialog" aria-modal="true" aria-labelledby="frames-shop-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="frames-shop-header"><div><span className="social-modal-kicker">PERSONALIZAÇÃO DO AVATAR</span><h2 id="frames-shop-title">Loja de molduras</h2><p>Escolha uma moldura para atualizar o preview na hora.</p></div><button className="frames-shop-close" type="button" aria-label="Fechar loja de molduras" onClick={onClose}><X size={18} /></button></header>
        <div className="frames-shop-body"><div className="frames-shop-plan-note">Seu plano atual: <b>{planLabel}</b></div><div className="frames-shop-grid">{FRAME_SHOP_OPTIONS.map((frame) => { const available = frame.plans.includes(plan); return <button key={frame.id} type="button" className={cn("frame-shop-option", selectedFrame === frame.id && "selected", !available && "locked")} onClick={() => available ? onSelect(frame.id) : onNotify(`A moldura ${frame.name} requer ${frame.note}`)}><span className={cn("frame-shop-sample", `profile-frame-${frame.id}`)}><span /></span><strong>{frame.name}</strong><small>{available ? (selectedFrame === frame.id ? "Selecionada" : frame.note) : `Disponível no ${frame.note}`}{!available && <LockKeyhole size={11} />}</small></button>; })}</div></div>
        <footer className="frames-shop-footer"><button type="button" onClick={onClose}>Concluir</button></footer>
      </section>
    </div>
  );
}

export function PublicProfileModal({ plan, displayName, username, about, socialStatus, statusMessage, showActivity, showServers, showMutualFriends, mural, selectedMuralFields, selectedFrame, photoUrl, bannerUrl, isSelf, onClose, onProfileAction }: {
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
  onClose: () => void;
  onProfileAction: (action: ProfileActionId) => void;
}) {
  const planLabel = plan === "astroPlusGold" ? "ASTRO PLUS" : plan === "astroPlus" ? "ASTRO+" : plan === "astro" ? "ASTRO" : "GRATUITO";
  const statusMeta: Record<SocialStatus, { label: string; color: string }> = {
    online: { label: "Online", color: "#22c55e" },
    away: { label: "Ausente", color: "#f59e0b" },
    dnd: { label: "Não Perturbe", color: "#ef4444" },
    invisible: { label: "Invisível", color: "#94a3b8" },
  };
  const visibleMural = MURAL_FIELD_DEFS.filter((definition) => selectedMuralFields.includes(definition.id));
  const frameName = FRAME_SHOP_OPTIONS.find((frame) => frame.id === selectedFrame)?.name ?? "Nenhuma";
  const avatar = photoUrl || (plan === "free" ? ASSETS.freeAvatar : plan === "astro" ? ASSETS.astroAvatar : plan === "astroPlus" ? ASSETS.astroPlusAvatar : ASSETS.astroPlusGoldAvatar);
  return (
    <div className="public-profile-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cn("public-profile-modal", plan === "astro" && "public-profile-astro", plan === "astroPlus" && "public-profile-astro-plus", plan === "astroPlusGold" && "public-profile-astro-plus-gold")} role="dialog" aria-modal="true" aria-labelledby="public-profile-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="public-profile-modal-header"><div><span className="social-modal-kicker">PERFIL PÚBLICO</span><h2 id="public-profile-title">{isSelf ? "Seu perfil público" : "Perfil de " + (displayName || "usuário")}</h2><p>Todas as informações configuradas pelo dono deste perfil.</p></div><button className="frames-shop-close" type="button" aria-label="Fechar perfil público" onClick={onClose}><X size={18} /></button></header>
        <div className="public-profile-body">
          <div className="public-profile-hero"><div className="public-profile-cover" style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center 30%' } : undefined} /><div className="public-profile-identity"><div className={cn("public-profile-avatar", `profile-frame-${selectedFrame}`)}><img src={avatar} alt={`Avatar de ${displayName || "usuário"}`} /></div><div className="public-profile-name"><span className="public-profile-plan">{planLabel}</span><h3>{displayName || "Seu nome"}</h3><p>@{username || "usuario"}</p><span className="public-profile-status"><i style={{ background: statusMeta[socialStatus].color }} />{statusMeta[socialStatus].label}</span></div><div className="public-profile-frame-note"><span>Moldura</span><strong>{frameName}</strong></div></div></div>
          <div className="public-profile-grid"><div className="public-profile-main"><section className="public-profile-panel"><div className="public-profile-panel-heading"><span>APRESENTAÇÃO</span><Sparkles size={14} /></div>{statusMessage && <p className="public-profile-message">“{statusMessage}”</p>}<p className={cn("public-profile-about", !about && "is-empty")}>{about || "Este perfil ainda não adicionou uma apresentação."}</p>{!isSelf && <div className="profile-preview-actions public-profile-actions" aria-label="Ações do perfil"><button type="button" className="profile-action-button primary" onClick={() => onProfileAction("request")}><UserPlus size={13} />Mandar solicitação</button><button type="button" className="profile-action-button" onClick={() => onProfileAction("message")}><MessageCircle size={13} />Conversar</button><button type="button" className="profile-action-button danger" onClick={() => onProfileAction("report")}><ShieldCheck size={13} />Denunciar usuário</button></div>}</section><section className="public-profile-panel"><div className="public-profile-panel-heading"><span>MURAL</span><Sparkles size={14} /></div><div className="public-profile-mural-list">{visibleMural.length ? visibleMural.flatMap(({ id, label, fallback }) => (mural[id] || []).map((item) => <article className="public-profile-mural-widget" key={item.id}><img src={item.image} alt={`Imagem de ${item.value || label}`} /><div><span>{label}</span><strong>{item.value.trim() || fallback}</strong></div></article>)) : <p className="profile-mural-empty">Este perfil ainda não escolheu categorias para o Mural.</p>}</div></section></div><aside className="public-profile-side"><section className="public-profile-panel"><div className="public-profile-panel-heading"><span>VISIBILIDADE</span><Eye size={14} /></div><div className="public-profile-visibility-list"><span className={showActivity ? "visible" : "hidden"}>{showActivity ? "Atividade visível" : "Atividade oculta"}</span><span className={showServers ? "visible" : "hidden"}>{showServers ? "Servidores em comum" : "Servidores privados"}</span><span className={showMutualFriends ? "visible" : "hidden"}>{showMutualFriends ? "Amigos em comum" : "Amigos privados"}</span></div></section></aside></div>
        </div>
        <footer className="public-profile-footer"><span>{isSelf ? "Este é o seu perfil público." : "Esta é uma visualização pública do perfil."}</span><button type="button" onClick={onClose}>Fechar perfil</button></footer>
      </section>
    </div>
  );
}

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
function AstroPlusDecorations({ selectedFrame, onFrameSelect, onOpenFrames, onNotify }: { selectedFrame: FrameId; onFrameSelect: (frame: FrameId) => void; onOpenFrames: () => void; onNotify: (message: string) => void }) {
  void selectedFrame; void onFrameSelect; void onOpenFrames; void onNotify;
    void selectedFrame; void onFrameSelect; void onOpenFrames; void onNotify;
  return (
    <section className="decorations-section">
      <SectionTitle icon={Sparkles} title="Decorações e molduras" description="Em breve — estamos preparando novidades." />
      <div className="decoration-strip">
        <div className="decoration-item" style={{ cursor: 'default', borderStyle: 'dashed' }}>
          <span className="decoration-empty"><Sparkles size={20} /></span>
          <b>Em breve</b>
        </div>
      </div>
    </section>
  );
}

function isAvailable(value: string) {
  return ["Disponível", "Acesso completo", "Acesso antecipado", "Até 250 MB", "Até 1 GB", "1080p / 60 FPS", "2K / 30 FPS", "Padrão", "Ampliada", "Maior qualidade", "Acesso limitado", "Somente alguns"].includes(value);
}

function PlanColumn({ plan, onUpgrade, onDowngrade, onEditBanner }: { plan: Plan; onUpgrade: () => void; onDowngrade: () => void; onEditBanner?: () => void }) {
  const isFree = plan === "free";
  const isAstro = plan === "astro";
  const isAstroPlusTier = plan === "astroPlus";
  const isAstroPlusGold = plan === "astroPlusGold";
  const [showResources, setShowResources] = useState(true);
  const features = isAstroPlusGold ? astroPlusGoldFeatures : isAstroPlusTier ? astroPlusFeatures : isAstro ? astroFeatures : freeFeatures;
  const planLabel = isAstroPlusGold ? "ASTRO PLUS" : isAstroPlusTier ? "ASTRO+" : isAstro ? "ASTRO" : "GRATUITO";
  const planClass = isAstroPlusGold ? "astro-plus-plan-column" : isAstroPlusTier ? "astro-plus-tier-plan-column" : isAstro ? "astro-plan-column" : "";
  const cardBannerAsset = isAstroPlusGold ? ASSETS.astroPlusGoldCardHeader : isAstroPlusTier ? ASSETS.astroPlusCardHeader : isAstro ? ASSETS.astroCardBanner : ASSETS.freeCardHeader;
  return (
    <aside className={cn("plan-column", planClass)}>
      <section className={cn("plan-card plan-summary-card", isFree && "free-summary-card", isAstro && "astro-summary-card", isAstroPlusTier && "astro-plus-tier-summary-card", isAstroPlusGold && "astro-plus-summary-card")}>
        <div className="astro-card-banner" role="img" aria-label={`Você está no plano ${planLabel}`}>
          <img src={cardBannerAsset} alt={`Você está no plano ${planLabel}`} />
          {onEditBanner && <button className="astro-card-banner-edit" type="button" aria-label="Editar banner" onClick={onEditBanner}><Pencil size={12} /></button>}
        </div>
        <div className="plan-divider" />
        <div className="plan-resources-heading">
          <h3>Recursos disponíveis no {planLabel}</h3>
          <button type="button" className={cn("resources-toggle", !showResources && "is-hidden")} onClick={() => setShowResources((current) => !current)} role="switch" aria-checked={showResources}>
            <span className="resources-toggle-track"><span className="resources-toggle-thumb" /></span>
            <small>{showResources ? "Esconder recursos" : "Mostrar recursos"}</small>
          </button>
        </div>
        {showResources && <ul className="available-list">{features.map((feature) => <li key={feature}><span className="check-dot"><Check size={10} strokeWidth={3} /></span>{feature}</li>)}</ul>}
        {showResources && isAstroPlusTier && <ul className="locked-feature-list astro-plus-tier-locked-list">{astroPlusTierLockedFeatures.map((feature) => <LockedFeatureRow key={feature} feature={feature} targetLabel="ASTRO PLUS" />)}</ul>}
        {showResources && isAstroPlusGold && <ul className="available-list astro-plus-gold-available-list">{astroPlusGoldLockedFeatures.map((feature) => <li key={feature}><span className="check-dot"><Check size={10} strokeWidth={3} /></span>{feature}</li>)}</ul>}
        {isAstro && <button className="plan-switch-link" onClick={onDowngrade}>Voltar ao Gratuito</button>}
        {isAstroPlusTier && <button className="plan-switch-link" onClick={onDowngrade}>Voltar ao ASTRO</button>}
        {isAstroPlusGold && <button className="plan-switch-link" onClick={onDowngrade}>Voltar ao ASTRO+</button>}
      </section>

      {isAstroPlusGold ? (
        <section className="plan-card compare-card astro-plus-gold-compare-card">
          <h3>Comparado ao ASTRO você tem:</h3>
          <div className="compare-table compare-table-two" role="table" aria-label="Comparação ASTRO Plus">
            <div className="compare-row compare-head" role="row"><span>Recurso</span><span>ASTRO PLUS</span></div>
            {astroPlusGoldComparisons.map(([label, value]) => <div className="compare-row" key={label} role="row"><span>{label}</span><span className="compare-next"><b><Check size={10} strokeWidth={3} /></b>{value}</span></div>)}
          </div>
        </section>
      ) : (
        <section className={cn("plan-card compare-card", isAstro && "astro-compare-card", isAstroPlusTier && "astro-plus-tier-compare-card")}>
          <h3>Comparado ao {isAstroPlusTier ? "ASTRO PLUS" : isAstro ? "ASTRO+" : "ASTRO"} você tem:</h3>
          <div className="compare-table" role="table" aria-label="Comparação de planos">
            <div className="compare-row compare-head" role="row"><span>Recurso</span><span>{isAstroPlusTier ? "ASTRO+ (atual)" : isAstro ? "ASTRO (atual)" : "Gratuito"}</span><span className="astro-text">{isAstroPlusTier ? "ASTRO PLUS" : isAstro ? "ASTRO+" : "ASTRO"}</span></div>
            {(isAstroPlusTier ? astroPlusTierComparisons : isAstro ? astroComparisons : [["Upload de arquivos", "Até 25 MB", "Até 250 MB"], ["Streaming (qualidade)", "720p / 30 FPS\n420p / 30 FPS", "1080p / 60 FPS"], ["Banner personalizado", "Não disponível", "Disponível"], ["Avatar animado", "Não disponível", "Disponível"], ["Molduras e efeitos", "Não disponível", "Disponível"], ["Emojis exclusivos", "Não disponível", "Disponível"], ["Insígnias exclusivas", "Não disponível", "Disponível"], ["Recursos antecipados", "Não disponível", "Disponível"], ["Acesso aos recursos Beta", "Não disponível", "Disponível"]] as const).map(([label, current, next]) => (
              <div className="compare-row" key={label} role="row"><span>{label}</span><span className={cn("compare-free", (isAstro || isAstroPlusTier) && "compare-current")}><b className={!isAvailable(current) ? "compare-unavailable" : undefined}>{isAvailable(current) ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}</b>{current}</span><span className={cn("compare-astro", (isAstro || isAstroPlusTier) && "compare-next")}><b><Check size={10} strokeWidth={3} /></b>{next}</span></div>
            ))}
          </div>
        </section>
      )}

      {!isAstroPlusGold && (
      <section className={cn("upgrade-card", isAstro && "astro-upgrade-card", isAstroPlusTier && "astro-plus-tier-upgrade-card")}>
        <h3>{isAstroPlusTier ? "Quer mais exclusividade?" : isAstro ? "Quer mais recursos?" : "Quer mais liberdade?"}</h3>
        <p>{isAstroPlusTier ? "Faça upgrade para ASTRO PLUS e libere todas as molduras, efeitos, streaming em 2K / 60 FPS e muito mais!" : isAstro ? "Tenha streaming em 2K / 30 FPS, upload de até 1 GB, compartilhamento em maior qualidade e muito mais!" : "Assine o ASTRO e personalize seu perfil com mais qualidade, recursos exclusivos e muito mais!"}</p>
        <ul>{(isAstroPlusTier ? ["Upload de até 5 GB", "Streaming em 2K / 60 FPS", "Todas as molduras premium"] : isAstro ? ["Streaming em 2K / 30 FPS", "Upload de até 1 GB", "Compartilhamento de tela em maior qualidade"] : ["Upload até 250 MB", "Streaming em 1080p / 60 FPS", "Banner, avatar animado, molduras e muito mais!"]).map((feature) => <li key={feature}><Check size={13} />{feature}</li>)}</ul>
        <button className={cn("astro-button", isAstro && "astro-plus-button", isAstroPlusTier && "astro-plus-tier-button")} onClick={onUpgrade}><Rocket size={16} />{isAstroPlusTier ? "Fazer upgrade para ASTRO PLUS" : isAstro ? "Fazer upgrade para ASTRO+" : "Assinar ASTRO"}</button>
      </section>
      )}
    </aside>
  );
}

export default function ProfileEditor({ onClose }: { onClose?: () => void }) {
  const { currentUser, updateUser } = useUserStore();
  const userSettings = (currentUser?.settings || {}) as Record<string, unknown>;
  const tier = getAstroTier(currentUser);
  const tierToPlan: Record<AstroTier | "none", Plan> = { none: "free", astro: "astro", astro_plus: "astroPlus", astro_ultimate: "astroPlusGold" };
  const [plan, setPlan] = useState<Plan>(tierToPlan[tier]);
  const savedAppearance = useMemo(() => clampAppearanceToPlan(parseAppearance(userSettings), tierToPlan[tier]), [userSettings, tier]);
  const [displayName, setDisplayName] = useState(currentUser?.name || "");
  const [username, setUsername] = useState(currentUser?.friendCode || "");
  const [about, setAbout] = useState(currentUser?.bio || "");
  const [photoUrl, setPhotoUrl] = useState(currentUser?.photoUrl || "");
  const [bannerUrl, setBannerUrl] = useState(currentUser?.bannerUrl || "");
  const [status, setStatus] = useState("");
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isPublicProfileOpen, setIsPublicProfileOpen] = useState(false);
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
  const [selectedFrame, setSelectedFrame] = useState<FrameId>("none");
  const [isFramesShopOpen, setIsFramesShopOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>(savedAppearance.theme);
  const [selectedFont, setSelectedFont] = useState<string>(savedAppearance.font);
  const [selectedBg, setSelectedBg] = useState<string>(savedAppearance.bg);
  const [selectedTextColor, setSelectedTextColor] = useState<AppearanceTextColorId>(savedAppearance.textColor);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropShape, setCropShape] = useState<"circle" | "rect">("circle");
  const [cropAspect, setCropAspect] = useState(1);
  const [driveModal, setDriveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const pendingDriveAction = useRef<"avatar" | "banner" | null>(null);
  const hydratedUserRef = useRef<string | null>(currentUser?.id || null);
  useEffect(() => {
    if (!currentUser?.id || hydratedUserRef.current === currentUser.id) return;
    hydratedUserRef.current = currentUser.id;
    setDisplayName(currentUser.name || "");
    setUsername(currentUser.friendCode || "");
    setAbout(currentUser.bio || "");
    setPhotoUrl(currentUser.photoUrl || "");
    setBannerUrl(currentUser.bannerUrl || "");
  }, [currentUser]);
  const appearanceStyleMemo = useMemo(() => appearanceStyle({ theme: selectedTheme as AppearanceThemeId, font: selectedFont as AppearanceFontId, bg: selectedBg as AppearanceBgId, textColor: selectedTextColor }), [selectedTheme, selectedFont, selectedBg, selectedTextColor]);
  const appearanceAttrs = useMemo(() => appearanceDataAttrs({ theme: selectedTheme as AppearanceThemeId, font: selectedFont as AppearanceFontId, bg: selectedBg as AppearanceBgId, textColor: selectedTextColor }), [selectedTheme, selectedFont, selectedBg, selectedTextColor]);
  useEffect(() => {
    const selectedOption = FRAME_SHOP_OPTIONS.find((item) => item.id === selectedFrame);
    if (selectedOption && !selectedOption.plans.includes(plan)) setSelectedFrame("none");
  }, [plan, selectedFrame]);
  const isAstro = plan === "astro";
  const isAstroPlusTier = plan === "astroPlus";
  const isAstroPlusGold = plan === "astroPlusGold";
  const isPaid = plan !== "free";
  const displayCount = useMemo(() => `${displayName.length}/20`, [displayName]);
  const usernameCount = useMemo(() => `${username.length}/20`, [username]);

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
    // NAO reseta a imagem aqui: ao digitar, a capa anterior permanece ate o
    // auto-fetch do iTunes trazer a nova (evita flash de fallback e perda de
    // capa quando a busca falha).
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

  const selectFrame = (frame: FrameId) => {
    setSelectedFrame(frame);
    setIsFramesShopOpen(false);
    const label = FRAME_SHOP_OPTIONS.find((item) => item.id === frame)?.name ?? "Nenhuma";
    notify(`Moldura ${label} aplicada ao preview`);
  };

  const handleUpgradeAstro = () => {
    onClose?.();
    window.dispatchEvent(new CustomEvent('friends-space:show-astro-plans'));
  };

  const handleUpgradeAstroPlus = () => {
    onClose?.();
    window.dispatchEvent(new CustomEvent('friends-space:show-astro-plans'));
  };

  const handleUpgradeAstroPlusGold = () => {
    onClose?.();
    window.dispatchEvent(new CustomEvent('friends-space:show-astro-plans'));
  };

  const handleCancel = () => {
    const savedTier = getAstroTier(currentUser);
    setDisplayName(currentUser?.name || "");
    setUsername(currentUser?.friendCode || "");
    setAbout(currentUser?.bio || "");
    setPhotoUrl(currentUser?.photoUrl || "");
    setBannerUrl(currentUser?.bannerUrl || "");
    setPlan(tierToPlan[savedTier]);
    setSelectedTheme(savedAppearance.theme);
    setSelectedFont(savedAppearance.font);
    setSelectedBg(savedAppearance.bg);
    setSelectedTextColor(savedAppearance.textColor);
    notify("Alterações canceladas");
  };

  const previousPlan = plan === "astroPlusGold" ? "astroPlus" : plan === "astroPlus" ? "astro" : "free";
  const restorePreviousPlan = () => {
    setPlan(previousPlan);
    notify(`Plano ${previousPlan === "astroPlus" ? "ASTRO+" : previousPlan === "astro" ? "ASTRO" : "Gratuito"} restaurado`);
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
      // GIF pula o crop (canvas mataria a animacao): usa direto.
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
        ...serializeAppearance({ theme: selectedTheme as AppearanceThemeId, font: selectedFont as AppearanceFontId, bg: selectedBg as AppearanceBgId, textColor: selectedTextColor }),
      };
      await updateUser({
        name: displayName.trim(),
        friendCode: username.toUpperCase(),
        bio: about.trim(),
        photoUrl: finalPhotoUrl,
        bannerUrl: finalBannerUrl,
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

  return (
    <div className="fs-profile-editor">
      <div className="fs-profile-editor-window">
      <div className="fs-profile-editor-topbar">
        <button className="fs-profile-editor-back" onClick={onClose}><ChevronLeft size={16} />Voltar</button>
        <h1 className="fs-profile-editor-topbar-title">Editar perfil</h1>
        <button className="fs-profile-editor-close" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>
      <div className="fs-profile-editor-body">
      <div className={cn("profile-crop-page", isPaid && "astro-profile-page", isAstroPlusTier && "astro-plus-tier-profile-page", isAstroPlusGold && "astro-plus-profile-page")} {...appearanceAttrs} style={appearanceStyleMemo}>
      <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => openCrop(e, "avatar")} />
      <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => openCrop(e, "banner")} />
      <main key={plan} className="main-layout plan-state-transition">
        <div className="editor-column">
          <div className="editor-top-grid">
            <ProfilePhoto plan={plan} onNotify={notify} selectedFrame={selectedFrame} photoUrl={photoUrl} onEditPhoto={requestAvatarChange} onRemovePhoto={() => setPhotoUrl("")} />
            <section className="basic-info-section">
              <div className="basic-info-heading">
                <SectionTitle icon={CircleUserRound} title="Informações básicas" />
                <div className="basic-info-actions">
                  <button className="header-social-btn" type="button" onClick={() => setIsSocialOpen(true)}><CircleDot size={13} />Social</button>

                </div>
              </div>
              <label className="control-label">Nome de exibição <em>*</em><span className="text-input-wrap"><input maxLength={20} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><small>{displayCount}</small></span></label>
              <label className="control-label">Nome de usuário <em>*</em><span className="text-input-wrap"><input maxLength={20} value={username} onChange={(event) => { setUsername(event.target.value.toUpperCase()); setUsernameError(""); }} /><small>{usernameCount}</small></span></label>
              {usernameError && <p className="ph-username-error">{usernameError}</p>}
              {!isPaid && <button className="username-lock-card" onClick={() => notify("No plano Gratuito, o limite é 0/1 usado")}><LockKeyhole size={17} /><span><b>Alterar nome de usuário</b><small>No plano Gratuito, você só pode alterar seu nome de usuário 1 vez.</small></span><strong>0/1 usado</strong></button>}
              <p className="profile-link">Seu link: <b>friends.space/@{username || "usuario"}</b></p>
            </section>
          </div>

          <AboutSection plan={plan} about={about} setAbout={setAbout} />
          {isAstroPlusGold ? <AstroPlusDecorations selectedFrame={selectedFrame} onFrameSelect={selectFrame} onOpenFrames={() => setIsFramesShopOpen(true)} onNotify={notify} /> : isAstroPlusTier ? <AstroPlusTierDecorations selectedFrame={selectedFrame} onFrameSelect={selectFrame} onOpenFrames={() => setIsFramesShopOpen(true)} onUpgrade={handleUpgradeAstroPlusGold} onNotify={notify} /> : isAstro ? <AstroDecorations selectedFrame={selectedFrame} onFrameSelect={selectFrame} onOpenFrames={() => setIsFramesShopOpen(true)} onUpgrade={handleUpgradeAstroPlus} /> : <PremiumUnavailable />}
          {isAstro && <AstroPlusUnavailable onUpgrade={handleUpgradeAstroPlus} />}
          {isAstroPlusTier && <AstroPlusGoldUnavailable onUpgrade={handleUpgradeAstroPlusGold} />}

          {isSocialOpen && <SocialSettingsModal plan={plan} displayName={displayName} username={username} about={about} selectedFrame={selectedFrame} status={socialStatus} onStatusChange={setSocialStatus} statusMessage={statusMessage} onStatusMessageChange={setStatusMessage} showActivity={showActivity} setShowActivity={setShowActivity} showServers={showServers} setShowServers={setShowServers} showMutualFriends={showMutualFriends} setShowMutualFriends={setShowMutualFriends} mural={mural} selectedMuralFields={selectedMuralFields} onMuralFieldToggle={toggleMuralField} onMuralItemAdd={addMuralItem} onMuralAutoFill={fillRecentFromActivity} onMuralItemChange={updateMuralItem} onMuralImageChange={updateMuralImage} onMuralItemRemove={removeMuralItem} onClose={() => setIsSocialOpen(false)} onNotify={notify} onViewProfile={() => setIsPublicProfileOpen(true)} onProfileAction={handleProfileAction} />}
          {isPublicProfileOpen && <PublicProfileModal plan={plan} displayName={displayName} username={username} about={about} socialStatus={socialStatus} statusMessage={statusMessage} showActivity={showActivity} showServers={showServers} showMutualFriends={showMutualFriends} mural={mural} selectedMuralFields={selectedMuralFields} selectedFrame={selectedFrame} onClose={() => setIsPublicProfileOpen(false)} onProfileAction={handleProfileAction} />}

          <div className="editor-actions"><button className="cancel-button" onClick={handleCancel} disabled={saving}>Cancelar</button><button className="save-button" onClick={() => void handleSave()} disabled={!displayName || !username || saving}>{saving ? "Salvando..." : "Salvar alterações"}</button></div>
        </div>
        <PlanColumn plan={plan} onUpgrade={plan === "free" ? handleUpgradeAstro : plan === "astro" ? handleUpgradeAstroPlus : plan === "astroPlus" ? handleUpgradeAstroPlusGold : () => notify("Você já está no ASTRO PLUS")} onDowngrade={restorePreviousPlan} onEditBanner={isPaid ? requestBannerChange : undefined} />
      </main>
      {status && <div className="toast-status"><Sparkles size={14} />{status}</div>}
      {isFramesShopOpen && <FramesShopModal plan={plan} selectedFrame={selectedFrame} onSelect={selectFrame} onClose={() => setIsFramesShopOpen(false)} onNotify={notify} />}
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
                <label>Tema de Cores ({plan.toUpperCase()})</label>
                <div className="appearance-options-grid">
                  {PLAN_THEMES[plan].map((tid) => (
                    <button
                      key={tid}
                      className={selectedTheme === tid ? "selected" : ""}
                      onClick={() => {
                        setSelectedTheme(tid);
                        notify(tid === "default" ? "Tema Padrão (verde e preto) aplicado" : "Tema Branco (preto e branco) aplicado");
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
                  {PLAN_BACKGROUNDS[plan].map((bid) => (
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
      </div>
      </div>
      </div>
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
  );
}
