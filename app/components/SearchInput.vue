<script setup lang="ts">
import { Search } from 'lucide-vue-next'

const props = withDefaults(defineProps<{ modelValue: string; label: string; placeholder?: string }>(), { placeholder: 'Cari…' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const local = ref(props.modelValue)
let timer: ReturnType<typeof setTimeout> | null = null
watch(() => props.modelValue, (v) => { local.value = v })
watch(local, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('update:modelValue', v.trim()), 350)
})
const id = useId()
</script>

<template>
  <div class="search">
    <label :for="id" class="sr-only">{{ label }}</label>
    <Search class="search-icon" :size="16" aria-hidden="true" />
    <input :id="id" v-model="local" class="input" type="search" :placeholder="placeholder" autocomplete="off">
  </div>
</template>

<style scoped>
/* Melebar mengisi sisa baris, sehingga filter di sebelahnya rata ke kanan. */
.search { position: relative; flex: 1 1 240px; min-width: 0; }
.search .input { padding-left: 2.25rem; }
.search-icon { position: absolute; top: 50%; left: 0.75rem; transform: translateY(-50%); color: var(--text-faint); pointer-events: none; }
</style>
