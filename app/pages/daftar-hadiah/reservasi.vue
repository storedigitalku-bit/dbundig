<script setup lang="ts">
useHead({ title: 'Reservasi — Daftar Hadiah — MDUNDIG' })
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Daftar Hadiah</h1>
        <p class="text-caption">Seluruh reservasi hadiah dari undangan yang dapat Anda akses.</p>
      </div>
    </div>
    <DaftarHadiahTabs />
    <ReservationTable />
  </div>
</template>
