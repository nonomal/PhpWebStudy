import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@web/core/type'

const module: AppModuleItem = {
  typeFlag: 'java',
  label: 'Java',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 18
}
export default module
