<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="current_tab === index ? 'active' : ''"
        @click="current_tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" type-flag="mongodb" title="MongoDB"></Service>
      <Manager v-else-if="current_tab === 1" type-flag="mongodb"></Manager>
      <Config v-if="current_tab === 2" :config="conf"></Config>
      <Logs v-if="current_tab === 3"></Logs>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from '../ServiceManager/index.vue'
  import Config from '../Base/Config.vue'
  import Logs from '../Base/Logs.vue'
  import Manager from '../VersionManager/index.vue'
  import { AppStore } from '../../store/app'
  import Conf from '../../config/mongodb.conf.txt?raw'

  const current_tab = ref(0)

  export default defineComponent({
    components: {
      Config,
      Service,
      Logs,
      Manager
    },
    props: {},
    data() {
      return {
        conf: Conf,
        current_tab
      }
    },
    computed: {
      tabs() {
        return [
          this.$t('base.service'),
          this.$t('base.versionManager'),
          this.$t('base.configFile'),
          this.$t('base.log')
        ]
      },
      version() {
        return AppStore().config.server?.mongodb?.current?.version
      }
    },
    watch: {},
    created: function () {}
  })
</script>
