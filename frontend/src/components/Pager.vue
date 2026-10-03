<template>
  <nav class="pager" aria-label="分页">
    <button class="btn" type="button" :disabled="page <= 1" @click="$emit('update:page', page - 1)">上一页</button>
    <span class="pager-info">第 {{ page }} / {{ lastPage }} 页</span>
    <button
      class="btn"
      type="button"
      :disabled="page >= lastPage"
      @click="$emit('update:page', page + 1)"
    >
      下一页
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ page: number; size: number; total: number }>()
defineEmits<{ (e: 'update:page', page: number): void }>()

const lastPage = computed(() => Math.max(1, Math.ceil(props.total / props.size)))
</script>
