/**
 * Home's icons, from Lucide (one line weight and corner style across the
 * app). Named for what they mean on Home so a swap is one line here. The
 * instrument pictures come from nav/TabIcons.jsx.
 */
import {
  ArrowLeft,
  AudioLines,
  ChevronRight,
  FileMusic,
  History,
  MessageCircle,
  Music,
  Plus,
  Target,
  Users,
  Zap,
} from 'lucide-react'

const base = { strokeWidth: 2, 'aria-hidden': true, focusable: 'false' }

export function PracticeIcon() {
  return <History size={20} {...base} />
}

export function TargetIcon() {
  return <Target size={20} {...base} />
}

export function BoltIcon() {
  return <Zap size={20} {...base} />
}

export function PeopleIcon() {
  return <Users size={20} {...base} />
}

export function FileIcon() {
  return <FileMusic size={20} {...base} />
}

export function NoteIcon() {
  return <Music size={20} {...base} />
}

export function WaveIcon() {
  return <AudioLines size={20} {...base} />
}

export function PlusIcon() {
  return <Plus size={20} {...base} />
}

export function ChevronIcon() {
  return <ChevronRight size={18} {...base} />
}

export function BackIcon() {
  return <ArrowLeft size={18} {...base} />
}

export function CommentIcon() {
  return <MessageCircle size={18} {...base} />
}
