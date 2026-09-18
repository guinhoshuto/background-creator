export interface PumpkinProps {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  glow: number;
  color: string;
  id: string;
}

export interface BareTreeProps {
  x: number;
  y: number;
  scale: number;
  mirror?: boolean;
  rotation: number;
  color: string;
}

const pumpkinFace = [
  'M-57-82 Q-46-105-32-109 Q-22-98-17-78 Q-35-83-57-82Z',
  'M18-79 Q25-98 39-106 Q53-97 60-79 Q39-83 18-79Z',
  'M-5-77 Q0-82 4-76 L12-61 Q0-58-10-62Z',
  'M-60-62 Q-48-57-37-52 L-33-61 L-21-58 L-20-48 Q0-40 20-48 L23-58 L34-61 L37-52 L61-64 Q54-39 35-29 L31-37 L19-33 L19-25 Q1-18-17-25 L-16-33 L-29-38 L-34-30 Q-53-40-60-62Z',
].join(' ');

/** Artwork coordinates are centred on the pumpkin; y marks its base. */
export const Pumpkin = ({
  x,
  y,
  scale,
  rotation = 0,
  glow,
  color,
  id,
}: PumpkinProps) => {
  const light = Math.max(0, Math.min(1, glow));
  const bodyId = `${id}-body`;
  const shadeId = `${id}-shade`;
  const faceId = `${id}-face`;
  const floorId = `${id}-floor`;

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#f6a450" />
          <stop offset="0.19" stopColor={color} />
          <stop offset="0.72" stopColor={color} />
          <stop offset="1" stopColor="#622b24" />
        </linearGradient>
        <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#351f25" stopOpacity="0.44" />
          <stop offset="0.3" stopColor="#351f25" stopOpacity="0" />
          <stop offset="0.67" stopColor="#ffcb83" stopOpacity="0.08" />
          <stop offset="1" stopColor="#291b24" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id={faceId} cx="48%" cy="58%" r="75%">
          <stop offset="0" stopColor="#fff3b8" />
          <stop offset="0.57" stopColor="#ffcf72" />
          <stop offset="1" stopColor="#fa8e3d" />
        </radialGradient>
        <radialGradient id={floorId}>
          <stop offset="0" stopColor="#fbb566" stopOpacity={0.06 + light * 0.08} />
          <stop offset="1" stopColor="#fbb566" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The ground contact stays horizontal even when the pumpkin leans. */}
      <ellipse cx="2" cy="2" rx="112" ry="13" fill={`url(#${floorId})`} />
      <ellipse cx="2" cy="0" rx="85" ry="9" fill="#07060C" opacity="0.45" />
      <ellipse cx="0" cy="-1" rx="57" ry="5" fill="#06050A" opacity="0.8" />

      <g transform={`rotate(${rotation})`}>

        <path
          d="M-13-137 Q-14-156-5-173 Q-2-181 11-180 L14-169 Q3-164 3-152 L7-137Z"
          fill="#465044"
        />
        <path d="M-7-145 Q-8-160 3-174" fill="none" stroke="#849267" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M2-142 C21-168 35-154 43-157 C56-163 43-174 39-165"
          fill="none"
          stroke="#65704b"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        <path
          d="M-2-139 C-27-150-42-142-50-134 C-80-139-96-111-97-80 C-100-49-85-18-61-12 C-43 2-21-1-4-5 C14 3 42 0 58-11 C84-15 100-46 98-79 C97-111 83-138 53-135 C40-145 18-148-2-139Z"
          fill={`url(#${bodyId})`}
        />
        <path
          d="M-2-139 C-27-150-42-142-50-134 C-80-139-96-111-97-80 C-100-49-85-18-61-12 C-43 2-21-1-4-5 C14 3 42 0 58-11 C84-15 100-46 98-79 C97-111 83-138 53-135 C40-145 18-148-2-139Z"
          fill={`url(#${shadeId})`}
        />

        <g fill="none" strokeLinecap="round">
          <path d="M-45-132 C-70-111-77-54-56-18" stroke="#612c24" strokeWidth="5" opacity="0.33" />
          <path d="M-21-138 C-44-107-43-37-24-8" stroke="#743021" strokeWidth="3.2" opacity="0.35" />
          <path d="M13-139 C32-111 37-40 23-8" stroke="#73301f" strokeWidth="3.2" opacity="0.35" />
          <path d="M47-132 C69-100 76-53 54-18" stroke="#51291f" strokeWidth="5" opacity="0.35" />
          <path d="M-49-124 C-62-104-66-81-63-63" stroke="#ffc37b" strokeWidth="2.5" opacity="0.22" />
          <path d="M-15-129 Q-25-111-27-91" stroke="#ffd59a" strokeWidth="2" opacity="0.28" />
          <path d="M23-128 Q35-109 38-92" stroke="#ffd092" strokeWidth="2" opacity="0.23" />
          <path d="M69-115 Q85-94 82-74" stroke="#ffa665" strokeWidth="2.5" opacity="0.16" />
        </g>

        <path d={pumpkinFace} fill="#48231e" stroke="#54261f" strokeWidth="3.5" strokeLinejoin="round" />
        <path
          d={pumpkinFace}
          fill={`url(#${faceId})`}
          stroke="#ffa644"
          strokeWidth="5"
          strokeLinejoin="round"
          opacity={0.07 + light * 0.13}
        />
        <path d={pumpkinFace} fill={`url(#${faceId})`} opacity={0.65 + light * 0.35} />
        <path d="M-54-82 Q-37-83-20-79 M22-80 Q41-83 56-80" fill="none" stroke="#fff0b1" strokeWidth="1.5" opacity={0.35 + light * 0.4} />
        <path d="M-15-136 Q-2-142 12-137" fill="none" stroke="#603c27" strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  );
};

/** A right-reaching silhouette. Mirror it to frame the opposite edge. */
export const BareTree = ({
  x,
  y,
  scale,
  mirror = false,
  rotation,
  color,
}: BareTreeProps) => (
  <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${mirror ? -scale : scale} ${scale})`} fill={color}>
    <path d="M-61 9 C-44-43-39-93-26-154 C-8-242 16-299-4-379 C-25-461-13-504 8-559 C30-615 10-666 29-723 C39-750 47-776 47-813 C57-778 53-747 46-718 C30-658 52-617 35-557 C13-483 3-461 21-394 C47-303 16-235 15-154 C14-76 22-29 49 9Z" />

    <path d="M-7-373 C50-403 68-443 95-484 C134-545 183-551 229-590 C251-609 265-635 267-671 C278-642 266-606 246-580 C212-538 160-531 129-485 C99-438 91-402 28-350Z" />
    <path d="M106-496 C164-492 207-500 253-522 C294-542 329-542 355-524 C378-509 394-509 419-518 C393-496 373-503 346-516 C319-529 291-525 257-507 C204-477 159-475 122-477Z" />
    <path d="M201-559 C196-599 174-622 168-653 C162-677 169-704 180-724 C174-694 174-674 185-654 C203-624 211-601 214-568Z" />
    <path d="M14-535 C-35-561-58-592-82-637 C-98-667-123-678-147-677 C-120-692-89-673-68-643 C-44-608-28-586 18-563Z" />
    <path d="M-65-628 C-62-665-48-687-63-725 C-76-754-100-766-103-793 C-91-768-63-755-52-728 C-35-690-46-661-53-636Z" />
    <path d="M35-638 C72-650 101-676 111-710 C119-739 131-760 157-769 C133-750 133-734 123-703 C111-665 87-641 36-625Z" />
    <path d="M38-711 C9-736-5-760-9-789 C-13-813-23-833-41-846 C-15-834-4-817 1-791 C7-762 19-744 44-725Z" />

    <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <path d="M246-584 Q302-608 310-655 Q317-678 338-684" strokeWidth="5" />
      <path d="M309-651 Q298-672 305-698" strokeWidth="2.5" />
      <path d="M316-524 Q322-568 348-588 Q365-598 367-615" strokeWidth="5" />
      <path d="M347-587 Q334-603 339-622" strokeWidth="2.5" />
      <path d="M363-518 Q384-547 410-546" strokeWidth="3.5" />
      <path d="M238-584 Q233-619 249-637" strokeWidth="3.5" />
      <path d="M178-665 Q198-678 207-702" strokeWidth="3" />
      <path d="M118-715 Q149-714 167-735" strokeWidth="3.5" />
      <path d="M76-651 Q79-690 61-712" strokeWidth="3.5" />
      <path d="M-78-640 Q-108-631-135-653" strokeWidth="4.5" />
      <path d="M-106-639 Q-126-627-146-634" strokeWidth="2.5" />
      <path d="M-53-697 Q-25-714-29-736" strokeWidth="3" />
      <path d="M-93-778 Q-117-766-131-781" strokeWidth="3" />
      <path d="M-2-776 Q15-798 10-817" strokeWidth="3" />
      <path d="M49-764 Q75-782 77-805" strokeWidth="3" />
      <path d="M1-285 Q-28-326-47-351 Q-65-377-64-404" strokeWidth="10" />
      <path d="M-43-346 Q-71-348-88-371" strokeWidth="4" />
    </g>

    <g fill="none" stroke="#aca0b4" strokeLinecap="round" opacity="0.07">
      <path d="M-26-27 C-24-127-8-186 3-242 C18-318 3-340 0-379" strokeWidth="3" />
      <path d="M13-391 C-2-459 3-499 21-544" strokeWidth="2.5" />
      <path d="M42-401 C91-444 101-495 136-519" strokeWidth="2" />
      <path d="M27-573 Q45-621 35-670" strokeWidth="2" />
    </g>
  </g>
);
