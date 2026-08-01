<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { withBase } from "vitepress";
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-title-before>
      <img
        class="docs-logo"
        :src="withBase('/logo.svg')"
        alt=""
        width="28"
        height="28"
      >
    </template>
  </DefaultTheme.Layout>
</template>

