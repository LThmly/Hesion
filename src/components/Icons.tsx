import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 16,
  children,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 3.5h12M2 8h12M2 12.5h8" />
    </Icon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3v10M3 8h10" />
    </Icon>
  );
}

export function IconSend(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
    </Icon>
  );
}

export function IconStop(props: IconProps) {
  return (
    <Icon {...props}>
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function IconMic(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="2.5" width="4" height="6.5" rx="2" />
      <path d="M4 8.5a4 4 0 008 0M8 12v1.5" />
    </Icon>
  );
}

export function IconScreen(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="12" height="7.5" rx="1.5" />
      <path d="M6 13h4M8 10.5V13" />
    </Icon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </Icon>
  );
}

/** Settings sliders — unambiguous (not a sun/gear hybrid) */
export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 4.5h11" />
      <path d="M5 2.5v4" />
      <path d="M2.5 11.5h11" />
      <path d="M11 9.5v4" />
      <circle cx="5" cy="4.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="11" cy="11.5" r="1.25" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconCompact(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="6" width="12" height="4" rx="1" />
    </Icon>
  );
}

export function IconExpand(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />
    </Icon>
  );
}

export function IconAttach(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 8.5l-5.2 5.2a2.6 2.6 0 01-3.7-3.7l6.3-6.3a1.8 1.8 0 012.5 2.5L7 11.6" />
    </Icon>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="3.5" width="8" height="10.5" rx="1.5" />
      <path d="M6.5 3.5V3a1.5 1.5 0 013 0v.5" />
      <path d="M6.5 7.5h3M6.5 10h3" />
    </Icon>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="5.5" r="2.25" />
      <path d="M3.5 13.5c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4" />
    </Icon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6.5l4 4 4-4" />
    </Icon>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5l4-4 4 4" />
    </Icon>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
    </Icon>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8H4M7.5 4.5L4 8l3.5 3.5" />
    </Icon>
  );
}

export function IconCards(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="3" width="8" height="10" rx="1.25" />
      <path d="M3 5v7.5A1.5 1.5 0 004.5 14H11" />
    </Icon>
  );
}

export function IconQuiz(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M6.4 6.4a1.7 1.7 0 012.5 1.5c0 1.1-1.6 1.3-1.6 2.3" />
      <circle cx="8" cy="11.4" r="0.6" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8a5 5 0 11-1.2-3.2" />
      <path d="M13 3.5V7h-3.5" />
    </Icon>
  );
}

export function IconStudy(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 5.5L8 3l5.5 2.5L8 8 2.5 5.5z" />
      <path d="M4 7v3.5c0 .6 1.8 1.8 4 1.8s4-1.2 4-1.8V7" />
      <path d="M13.5 5.5V10" />
    </Icon>
  );
}

export function IconChat(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4.5h10v7H7.5L4.5 14v-2.5H3z" />
    </Icon>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M6.5 6.3a1.6 1.6 0 012.7 1.1c0 1-.8 1.3-1.2 1.7-.3.3-.5.6-.5 1.1" />
      <circle cx="8" cy="11.5" r="0.55" fill="currentColor" stroke="none" />
    </Icon>
  );
}
