interface PlaybackStartedToastProps {
  message: string;
}

export function PlaybackStartedToast({ message }: PlaybackStartedToastProps) {
  return (
    <aside className="playback-started-toast" role="status" aria-live="polite">
      {message}
    </aside>
  );
}
