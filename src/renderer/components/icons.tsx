import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Captions,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Compass,
  Copy,
  Crown,
  Dna,
  Heart,
  History,
  Info,
  LayoutGrid,
  ListMusic,
  ListPlus,
  Lock,
  LogIn,
  Maximize2,
  Menu,
  Minus,
  Moon,
  MoreHorizontal,
  Music,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  RotateCcw,
  ScanLine,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  X,
  XCircle,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface IconViewProps {
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
  className?: string;
}

function makeIcon(Icon: LucideIcon) {
  return function IconView({ size = 16, strokeWidth = 2, filled = false, className }: IconViewProps) {
    return (
      <Icon
        width={size}
        height={size}
        strokeWidth={filled ? undefined : strokeWidth}
        fill={filled ? 'currentColor' : 'none'}
        className={className}
        aria-hidden="true"
      />
    );
  };
}

export const NavDiscoverIcon = makeIcon(Compass);
export const NavChartsIcon = makeIcon(BarChart3);
export const NavPlaylistIcon = makeIcon(LayoutGrid);
export const NavHistoryIcon = makeIcon(History);
export const NavDnaIcon = makeIcon(Dna);

export const ModeSequenceIcon = makeIcon(ListMusic);
export const ModeShuffleIcon = makeIcon(Shuffle);
export const ModeSingleLoopIcon = makeIcon(Repeat1);
export const ModeListLoopIcon = makeIcon(Repeat);

export const PlayIcon = makeIcon(Play);
export const PauseIcon = makeIcon(Pause);
export const SkipBackIcon = makeIcon(SkipBack);
export const SkipForwardIcon = makeIcon(SkipForward);

export const VolumeLowIcon = makeIcon(Volume1);
export const VolumeHighIcon = makeIcon(Volume2);
export const VolumeMutedIcon = makeIcon(VolumeX);

export const QueueIcon = makeIcon(ListMusic);
export const SimilarIcon = makeIcon(Sparkles);
export const HeartIcon = makeIcon(Heart);
export const MoreIcon = makeIcon(MoreHorizontal);
export const MenuIcon = makeIcon(Menu);
export const PlayBadgeIcon = makeIcon(Play);

export const CollapseIcon = makeIcon(ChevronDown);
export const CloseIcon = makeIcon(X);
export const ThemeLightIcon = makeIcon(Sun);
export const ThemeDarkIcon = makeIcon(Moon);
export const BackIcon = makeIcon(ChevronLeft);
export const ForwardIcon = makeIcon(ChevronRight);
export const ChevronRightIcon = makeIcon(ChevronRight);
export const SearchIcon = makeIcon(Search);
export const MusicNoteIcon = makeIcon(Music2);

export const ToastSuccessIcon = makeIcon(CheckCircle2);
export const ToastWarningIcon = makeIcon(AlertTriangle);
export const ToastErrorIcon = makeIcon(XCircle);
export const ToastInfoIcon = makeIcon(Info);
export const CheckIcon = makeIcon(Check);
export const ExpandIcon = makeIcon(Maximize2);
export const MusicIcon = makeIcon(Music);
export const PanelCollapseIcon = makeIcon(PanelLeftClose);
export const PanelExpandIcon = makeIcon(PanelLeftOpen);
export const MinimizeIcon = makeIcon(Minus);
export const MaximizeIcon = makeIcon(Square);
export const RestoreIcon = makeIcon(Copy);
export const CloseWindowIcon = makeIcon(X);
export const ZoomInIcon = makeIcon(ZoomIn);
export const ZoomOutIcon = makeIcon(ZoomOut);
export const MinusIcon = makeIcon(Minus);
export const ResetIcon = makeIcon(RotateCcw);
export const AddToListIcon = makeIcon(ListPlus);
export const RemoveIcon = makeIcon(Trash2);
export const PlusIcon = makeIcon(Plus);
export const LockIcon = makeIcon(Lock);
export const UserIcon = makeIcon(CircleUserRound);
export const CrownIcon = makeIcon(Crown);
export const VolumeUpIcon = makeIcon(Volume2);
export const LoginIcon = makeIcon(LogIn);
export const ScanIcon = makeIcon(ScanLine);
export const LyricsIcon = makeIcon(Captions);
