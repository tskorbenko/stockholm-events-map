export function SiteHeader() {
  return (
    <header className="h-7 border-b border-zinc-200/80 bg-zinc-50/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-zinc-50/80 md:h-14">
      <div className="mx-auto flex h-full w-full max-w-screen-2xl items-center justify-between">
        <h1 className="text-xs font-semibold tracking-tight text-zinc-800 md:text-sm">
          Stockholms händelsekarta
        </h1>
        <p className="text-[10px] text-zinc-500 md:text-xs">Beta</p>
      </div>
    </header>
  );
}
