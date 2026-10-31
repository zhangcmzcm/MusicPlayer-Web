<script setup>
defineProps({ tint: { type: String, default: '#ffffff' } })
</script>

<template>
  <svg
    viewBox="0 0 740 760"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M247 716C231 654 129 638 111 519C84 343 228 200 367 157C456 130 501 91 530 39C518 107 554 157 589 213C660 324 638 461 561 554C476 655 349 650 247 716Z"
      :fill="tint"
    />
    <g fill="none" stroke="#dbe5cc" stroke-linecap="round" opacity=".48">
      <path d="M232 749Q242 724 247 701" stroke-width="7" />
      <path
        d="M247 701Q259 643 279 612M280 612Q207 585 172 536M283 609Q428 625 511 561M424 171Q489 153 529 49M489 167Q528 194 548 226"
        stroke-width="1.3"
      />
    </g>
  </svg>
</template>
