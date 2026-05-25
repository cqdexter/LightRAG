export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3" style={{ alignSelf: 'flex-start' }}>
      <span
        className="size-2 rounded-full animate-bounce"
        style={{ background: 'var(--color-text-secondary)', animationDelay: '0s' }}
      />
      <span
        className="size-2 rounded-full animate-bounce"
        style={{ background: 'var(--color-text-secondary)', animationDelay: '0.2s' }}
      />
      <span
        className="size-2 rounded-full animate-bounce"
        style={{ background: 'var(--color-text-secondary)', animationDelay: '0.4s' }}
      />
    </div>
  );
}
