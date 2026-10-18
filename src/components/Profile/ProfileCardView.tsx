import type { CSSProperties, ReactNode } from "react";
import { Check, Rocket } from "lucide-react";
import { cn } from "./ProfileEditor/cn";
import "./ProfileCardView.css";

export type ProfileCardViewProps = {
  displayName: string;
  username: string;
  about: string;
  emptyAbout?: string;
  avatarSrc?: string;
  avatarFallback?: string;
  bannerStyle?: CSSProperties;
  statusMessage?: string;
  memberSince?: string;
  pronoun?: string;
  verified?: boolean;
  paid?: boolean;
  showAstroBadge?: boolean;
  plateClass?: string;
  nameClass?: string;
  nameStyle?: CSSProperties;
  avatarClass?: string;
  cardClass?: string;
  effectClass?: string;
  className?: string;
  children?: ReactNode;
};

export function ProfileCardView({ displayName, username, about, emptyAbout, avatarSrc, avatarFallback, bannerStyle, statusMessage, memberSince, pronoun, verified, paid, showAstroBadge, plateClass, nameClass, nameStyle, avatarClass, cardClass, effectClass, className, children }: ProfileCardViewProps) {
  return (
    <div className={cn("ape-card", cardClass, className)}>
      <div className="ape-card-inner">
        <div className="ape-card-banner" style={bannerStyle} />
        <div className="ape-avatar-wrap">
          <div className={cn("ape-avatar", avatarClass)}>
            {avatarSrc
              ? <img src={avatarSrc} alt={`Avatar de ${displayName || "usuário"}`} />
              : <div className="ape-avatar-fallback">{(avatarFallback || displayName || "?").charAt(0).toUpperCase()}</div>}
          </div>
        </div>
        <div className="ape-card-body">
          <div className="ape-card-name-row">
            <div className="ape-card-name">
              <span className="ape-name-line">
                <span className={cn("ape-plate", plateClass)}>
                  <span className={cn("ape-display-name", nameClass)} style={nameStyle}>{displayName || "Seu nome"}</span>
                </span>
                {paid && showAstroBadge && <span className="ape-badge-astro"><Rocket size={16} /></span>}
                {verified && <span className="profile-card-verified" title="Verificado"><Check size={13} /></span>}
              </span>
              <span className="ape-handle-line">
                <span className="ape-handle">@{username || "usuario"}</span>
                {pronoun && <span className="ape-handle">· {pronoun}</span>}
              </span>
            </div>
          </div>
          {statusMessage && <p className="profile-card-message">“{statusMessage}”</p>}
          <div className="ape-block-label">Sobre mim</div>
          <p className={cn("ape-about", !about && "is-empty")}>{about || emptyAbout || "Descreva-se em três emojis"}</p>
          {memberSince && (
            <>
              <div className="ape-block-label">Membro desde</div>
              <p className="ape-member-since">{memberSince}</p>
            </>
          )}
          {children}
        </div>
        {effectClass && <span className={cn("ape-effect-layer", effectClass)} />}
      </div>
    </div>
  );
}
