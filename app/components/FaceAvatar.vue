<script setup lang="ts">
/**
 * Avatar kartun deterministik (port dari Apeiron-portal UserAvatar.vue).
 * Digambar sendiri (tanpa layanan pihak ketiga, tanpa dependensi). Benih yang sama → wajah yang sama;
 * tidak menebak gender — variasi dari rambut, kulit, pakaian, dan latar.
 */
const props = withDefaults(defineProps<{ seed: string; name?: string; size?: number }>(), { name: '', size: 36 })

const BG = ['#e8effb', '#eef1f6', '#fdf1e7', '#f3eefb', '#e9f4f8', '#fbeef3']
const SKIN = ['#f7e0cb', '#f2d3b8', '#e0b596', '#c98d64', '#a06840', '#7d4f33']
const HAIR = ['#2b2724', '#4b3621', '#8a5a2b', '#c9873f', '#6f6f76', '#1f2a44']
const CLOTHES = ['#4b7bec', '#2f8fb0', '#e08a3c', '#8b6bd4', '#5a6b7a', '#d4547e']
const STYLES = ['flat', 'round', 'side', 'curly', 'bun', 'buzz'] as const
const INK = '#2f2b3a'

function hashOf(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const h = computed(() => hashOf(props.seed || props.name || '?'))
const pick = <T,>(list: readonly T[], shift: number): T => list[(h.value >>> shift) % list.length] as T
const bg = computed(() => pick(BG, 0))
const skin = computed(() => pick(SKIN, 5))
const hair = computed(() => pick(HAIR, 10))
const clothes = computed(() => pick(CLOTHES, 15))
const style = computed(() => pick(STYLES, 20))
const clipId = `av-${useId()}`
</script>

<template>
  <span class="avatar-face" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 64 64" role="img" :aria-label="name || 'Avatar'">
      <defs><clipPath :id="clipId"><circle cx="32" cy="26" r="14" /></clipPath></defs>
      <rect width="64" height="64" :fill="bg" />
      <path d="M32 40c-11 0-20 8-21 18v6h42v-6c-1-10-10-18-21-18z" :fill="clothes" />
      <rect x="28" y="33" width="8" height="10" rx="4" :fill="skin" />
      <circle cx="18" cy="27" r="3" :fill="skin" />
      <circle cx="46" cy="27" r="3" :fill="skin" />
      <circle cx="32" cy="26" r="14" :fill="skin" />
      <g :clip-path="`url(#${clipId})`" :fill="hair">
        <rect v-if="style === 'flat'" x="16" y="9" width="32" height="10" />
        <ellipse v-else-if="style === 'round'" cx="32" cy="17" rx="16" ry="10" />
        <path v-else-if="style === 'side'" d="M16 9h32v9c-7 1-9-4-14-4s-9 7-18 4z" />
        <g v-else-if="style === 'curly'"><circle cx="23" cy="17" r="7" /><circle cx="32" cy="13" r="8" /><circle cx="41" cy="17" r="7" /></g>
        <ellipse v-else-if="style === 'bun'" cx="32" cy="17" rx="16" ry="9" />
        <rect v-else x="16" y="10" width="32" height="7" />
      </g>
      <circle v-if="style === 'bun'" cx="32" cy="9" r="5" :fill="hair" />
      <circle cx="27" cy="27" r="1.7" :fill="INK" />
      <circle cx="37" cy="27" r="1.7" :fill="INK" />
      <path d="M28 32.5c1.4 1.9 6.6 1.9 8 0" :stroke="INK" stroke-width="1.4" stroke-linecap="round" fill="none" />
    </svg>
  </span>
</template>

<style scoped>
.avatar-face { display: inline-block; flex-shrink: 0; border-radius: 999px; overflow: hidden; }
.avatar-face svg { width: 100%; height: 100%; display: block; }
</style>
