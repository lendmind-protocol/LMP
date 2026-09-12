import Image from "next/image";

export function BrainField() {
  return (
    <div
      className="lmp-brain-field relative mb-[clamp(1.5rem,5vw,2rem)] min-w-0 overflow-hidden bg-transparent"
      aria-label="Animated ASCII mind portrait"
    >
      <Image
        src="/assets/ascii-magic-transparent.gif"
        alt=""
        width={1312}
        height={1199}
        unoptimized
        className="mx-auto block h-auto w-full max-w-[560px] object-contain"
        priority
      />
    </div>
  );
}
