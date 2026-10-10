import type { CSSProperties, MouseEventHandler } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faAnglesLeft,
  faAnglesRight,
  faArrowDown,
  faArrowDownAZ,
  faArrowLeft,
  faArrowRight,
  faArrowTrendUp,
  faArrowUp,
  faArrowUpRightFromSquare,
  faArrowUpZA,
  faArrowsRotate,
  faBan,
  faBell,
  faBookOpen,
  faCalendar,
  faCalendarDays,
  faChartColumn,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faCircleQuestion,
  faCircleXmark,
  faClock,
  faCopy,
  faDesktop,
  faDownload,
  faEllipsis,
  faEllipsisVertical,
  faEnvelope,
  faEye,
  faEyeSlash,
  faFileLines,
  faFilter,
  faFloppyDisk,
  faForwardStep,
  faGear,
  faGlobe,
  faGripVertical,
  faHeadphones,
  faKeyboard,
  faLocationDot,
  faLock,
  faMagnifyingGlass,
  faMessage,
  faMicrophone,
  faMicrophoneSlash,
  faMoon,
  faPalette,
  faPause,
  faPencil,
  faPenToSquare,
  faPhone,
  faPhoneSlash,
  faPhoneVolume,
  faPlay,
  faPlus,
  faRightFromBracket,
  faRightToBracket,
  faRotateLeft,
  faShieldHalved,
  faSquareCheck,
  faSquarePhone,
  faSquarePhoneFlip,
  faStar,
  faStop,
  faStopwatch,
  faSun,
  faTableColumns,
  faThumbsUp,
  faTrashCan,
  faTriangleExclamation,
  faUser,
  faUsers,
  faVideo,
  faVolumeHigh,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

/**
 * App icons: Font Awesome 6 Solid behind the names the app already uses, so
 * every icon comes from one set and size utilities (w-4 h-4) keep working.
 * Add an icon here, then import it from "@/components/ui/icons".
 */
export interface IconProps {
  className?: string;
  style?: CSSProperties;
  title?: string;
  onClick?: MouseEventHandler<SVGSVGElement>;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
}

export type IconComponent = (props: IconProps) => JSX.Element;

function solid(icon: IconDefinition, name: string): IconComponent {
  const Icon = ({ className, style, title, onClick, ...aria }: IconProps) => (
    <FontAwesomeIcon icon={icon} className={className} style={style} title={title} onClick={onClick} {...aria} />
  );
  Icon.displayName = name;
  return Icon;
}

export const AlertCircle = solid(faCircleExclamation, "AlertCircle");
export const AlertTriangle = solid(faTriangleExclamation, "AlertTriangle");
export const ArrowDown = solid(faArrowDown, "ArrowDown");
export const ArrowDownAZ = solid(faArrowDownAZ, "ArrowDownAZ");
export const ArrowLeft = solid(faArrowLeft, "ArrowLeft");
export const ArrowRight = solid(faArrowRight, "ArrowRight");
export const ArrowUp = solid(faArrowUp, "ArrowUp");
export const ArrowUpZA = solid(faArrowUpZA, "ArrowUpZA");
export const AudioLines = solid(faVolumeHigh, "AudioLines");
export const Ban = solid(faBan, "Ban");
export const BarChart3 = solid(faChartColumn, "BarChart3");
export const Bell = solid(faBell, "Bell");
export const BookOpen = solid(faBookOpen, "BookOpen");
export const Calendar = solid(faCalendar, "Calendar");
export const CalendarDays = solid(faCalendarDays, "CalendarDays");
export const Check = solid(faCheck, "Check");
export const CheckCircle = solid(faCircleCheck, "CheckCircle");
export const CheckSquare = solid(faSquareCheck, "CheckSquare");
export const ChevronDown = solid(faChevronDown, "ChevronDown");
export const ChevronLeft = solid(faChevronLeft, "ChevronLeft");
export const ChevronRight = solid(faChevronRight, "ChevronRight");
export const Clock = solid(faClock, "Clock");
export const Columns3 = solid(faTableColumns, "Columns3");
export const Copy = solid(faCopy, "Copy");
export const Download = solid(faDownload, "Download");
export const Edit3 = solid(faPenToSquare, "Edit3");
export const ExternalLink = solid(faArrowUpRightFromSquare, "ExternalLink");
export const Eye = solid(faEye, "Eye");
export const EyeOff = solid(faEyeSlash, "EyeOff");
export const FileText = solid(faFileLines, "FileText");
export const Globe = solid(faGlobe, "Globe");
export const GripVertical = solid(faGripVertical, "GripVertical");
export const Headphones = solid(faHeadphones, "Headphones");
export const HelpCircle = solid(faCircleQuestion, "HelpCircle");
export const Info = solid(faCircleInfo, "Info");
export const Keyboard = solid(faKeyboard, "Keyboard");
export const ListFilter = solid(faFilter, "ListFilter");
export const Lock = solid(faLock, "Lock");
export const LogIn = solid(faRightToBracket, "LogIn");
export const LogOut = solid(faRightFromBracket, "LogOut");
export const Mail = solid(faEnvelope, "Mail");
export const MapPin = solid(faLocationDot, "MapPin");
export const MessageSquare = solid(faMessage, "MessageSquare");
export const Mic = solid(faMicrophone, "Mic");
export const MicOff = solid(faMicrophoneSlash, "MicOff");
export const Monitor = solid(faDesktop, "Monitor");
export const Moon = solid(faMoon, "Moon");
export const MoreHorizontal = solid(faEllipsis, "MoreHorizontal");
export const MoreVertical = solid(faEllipsisVertical, "MoreVertical");
export const Palette = solid(faPalette, "Palette");
export const PanelLeftClose = solid(faAnglesLeft, "PanelLeftClose");
export const PanelLeftOpen = solid(faAnglesRight, "PanelLeftOpen");
export const Pause = solid(faPause, "Pause");
export const Pencil = solid(faPencil, "Pencil");
export const Phone = solid(faPhone, "Phone");
export const PhoneCall = solid(faPhoneVolume, "PhoneCall");
export const PhoneIncoming = solid(faSquarePhoneFlip, "PhoneIncoming");
export const PhoneOff = solid(faPhoneSlash, "PhoneOff");
export const PhoneOutgoing = solid(faSquarePhone, "PhoneOutgoing");
export const Play = solid(faPlay, "Play");
export const Plus = solid(faPlus, "Plus");
export const RefreshCw = solid(faArrowsRotate, "RefreshCw");
export const RotateCcw = solid(faRotateLeft, "RotateCcw");
export const Save = solid(faFloppyDisk, "Save");
export const Search = solid(faMagnifyingGlass, "Search");
export const Settings = solid(faGear, "Settings");
export const Shield = solid(faShieldHalved, "Shield");
export const SkipForward = solid(faForwardStep, "SkipForward");
export const Square = solid(faStop, "Square");
export const Star = solid(faStar, "Star");
export const Sun = solid(faSun, "Sun");
export const ThumbsUp = solid(faThumbsUp, "ThumbsUp");
export const Timer = solid(faStopwatch, "Timer");
export const Trash2 = solid(faTrashCan, "Trash2");
export const TrendingUp = solid(faArrowTrendUp, "TrendingUp");
export const User = solid(faUser, "User");
export const Users = solid(faUsers, "Users");
export const Video = solid(faVideo, "Video");
export const X = solid(faXmark, "X");
export const XCircle = solid(faCircleXmark, "XCircle");
