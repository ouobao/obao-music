import { CloseWindowIcon, MaximizeIcon, MinimizeIcon } from './icons';

export function WindowControls() {
  const handleMinimize = () => {
    void window.musicPlayer.window.minimize?.();
  };

  const handleMaximize = () => {
    void window.musicPlayer.window.toggleMaximize?.();
  };

  const handleClose = () => {
    void window.musicPlayer.window.close?.();
  };

  return (
    <div className="window-controls" role="group" aria-label="窗口控制">
      <button className="window-control-btn" title="最小化" aria-label="最小化" onClick={handleMinimize}>
        <MinimizeIcon size={13} strokeWidth={2} />
      </button>
      <button className="window-control-btn" title="最大化 / 还原" aria-label="最大化 / 还原" onClick={handleMaximize}>
        <MaximizeIcon size={12} strokeWidth={2} />
      </button>
      <button className="window-control-btn window-control-close" title="关闭" aria-label="关闭" onClick={handleClose}>
        <CloseWindowIcon size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
