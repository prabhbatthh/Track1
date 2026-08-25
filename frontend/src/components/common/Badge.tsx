// ui/Badge already covers this (including as the eyebrow pattern SectionHeading uses) and is
// imported from `@/components/ui` in 8+ files — re-exporting here (same precedent as
// landing/components/FadeUp.tsx re-exporting common/FadeUp) avoids a second real implementation.
export { Badge, type BadgeProps, type BadgeVariant } from '@/components/ui/Badge';
