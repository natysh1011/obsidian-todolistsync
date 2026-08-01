<script setup lang="ts">
import { useData, withBase } from "vitepress";

interface HomeAction {
  theme?: "brand" | "alt";
  text: string;
  link: string;
}

interface HomeFeature {
  title: string;
  details: string;
}

const { frontmatter } = useData<{
  hero?: {
    name?: string;
    text?: string;
    tagline?: string;
    actions?: HomeAction[];
  };
  features?: HomeFeature[];
}>();
</script>

<template>
  <main class="custom-home" tabindex="-1">
    <section class="custom-home-hero" aria-labelledby="home-title">
      <div class="custom-home-kicker">TODOIST · MARKDOWN · YOUR VAULT</div>
      <h1 id="home-title">
        <span>{{ frontmatter.hero?.name }}</span>
        {{ frontmatter.hero?.text }}
      </h1>
      <p>{{ frontmatter.hero?.tagline }}</p>
      <div class="custom-home-actions">
        <a
          v-for="action in frontmatter.hero?.actions"
          :key="action.link"
          :class="['custom-home-action', action.theme === 'alt' && 'is-alt']"
          :href="withBase(action.link)"
        >
          {{ action.text }}
        </a>
      </div>
    </section>

    <section class="custom-home-features" aria-label="Product highlights">
      <article v-for="feature in frontmatter.features" :key="feature.title">
        <h2>{{ feature.title }}</h2>
        <p>{{ feature.details }}</p>
      </article>
    </section>

    <div class="custom-home-content">
      <Content />
    </div>
  </main>
</template>

