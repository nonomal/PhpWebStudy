<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 title">{{ version.version }} - {{ version.path }} - php.ini</span>
        </div>
      </div>

      <Conf
        ref="conf"
        :type-flag="'php'"
        :default-file="defaultFile"
        :file="file"
        :file-ext="'ini'"
        :show-commond="true"
        @on-type-change="onTypeChange"
      >
        <template #common>
          <Common :setting="commonSetting" />
        </template>
      </Conf>
    </div>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { computed, ref, watch, Ref, reactive } from 'vue'
  import Conf from '@/components/Conf/drawer.vue'
  import Common from '@/components/Conf/common.vue'
  import { type CommonSetItem, ConfStore } from '@/components/Conf/setup'
  import { I18nT } from '@lang/index'
  import { debounce } from 'lodash-es'
  import { SoftInstalled } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { uuid } from '@/util/Index'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const flag = computed(() => {
    return props?.version?.phpBin ?? props?.version?.path
  })

  const conf = ref()
  const commonSetting: Ref<CommonSetItem[]> = ref([])
  const file = computed(() => {
    return ConfStore.phpIniFiles?.[flag?.value] ?? ''
  })
  const defaultFile = computed(() => {
    if (!file.value) {
      return ''
    }
    return `${file.value}.default`
  })
  const cacert = join(window.Server.BaseDir!, 'CA/cacert.pem')
  const names: CommonSetItem[] = [
    {
      name: 'display_errors',
      value: 'On',
      enable: true,
      options: [
        {
          value: 'Off',
          label: 'Off'
        },
        {
          value: 'On',
          label: 'On'
        }
      ],
      tips() {
        return I18nT('php.display_errors')
      }
    },
    {
      name: 'short_open_tag',
      value: 'On',
      enable: true,
      options: [
        {
          value: 'Off',
          label: 'Off'
        },
        {
          value: 'On',
          label: 'On'
        }
      ],
      tips() {
        return I18nT('php.short_open_tag')
      }
    },
    {
      name: 'file_uploads',
      value: 'On',
      enable: true,
      options: [
        {
          value: 'Off',
          label: 'Off'
        },
        {
          value: 'On',
          label: 'On'
        }
      ],
      tips() {
        return I18nT('php.file_uploads')
      }
    },
    {
      name: 'cgi.fix_pathinfo',
      value: '1',
      enable: true,
      options: [
        {
          value: '0',
          label: '0'
        },
        {
          value: '1',
          label: '1'
        }
      ],
      tips() {
        return I18nT('php.fix_pathinfo')
      }
    },
    {
      name: 'max_execution_time',
      value: '300',
      enable: true,
      tips() {
        return I18nT('php.max_execution_time')
      }
    },
    {
      name: 'max_input_time',
      value: '60',
      enable: true,
      tips() {
        return I18nT('php.max_input_time')
      }
    },
    {
      name: 'memory_limit',
      value: '128M',
      enable: true,
      tips() {
        return I18nT('php.memory_limit')
      }
    },
    {
      name: 'post_max_size',
      value: '20M',
      enable: true,
      tips() {
        return I18nT('php.post_max_size')
      }
    },
    {
      name: 'upload_max_filesize',
      value: '20M',
      enable: true,
      tips() {
        return I18nT('php.upload_max_filesize')
      }
    },
    {
      name: 'max_file_uploads',
      value: '20',
      enable: true,
      tips() {
        return I18nT('php.max_file_uploads')
      }
    },
    {
      name: 'default_socket_timeout',
      value: '60',
      enable: true,
      tips() {
        return I18nT('php.default_socket_timeout')
      }
    },
    {
      name: 'error_reporting',
      value: 'E_ALL & ~E_NOTICE',
      enable: true,
      tips() {
        return I18nT('php.error_reporting')
      }
    },
    {
      name: 'date.timezone',
      value: 'PRC',
      enable: true,
      tips() {
        return I18nT('php.timezone')
      }
    },
    {
      name: 'curl.cainfo',
      value: `"${cacert}"`,
      enable: true,
      isFile: true,
      tips() {
        return `curl.cainfo. can found in ${cacert}`
      },
      pathHandler(dir) {
        return `"${dir}"`
      }
    },
    {
      name: 'openssl.cafile',
      value: `"${cacert}"`,
      enable: true,
      isFile: true,
      tips() {
        return `openssl.cafile. can found in ${cacert}`
      },
      pathHandler(dir) {
        return `"${dir}"`
      }
    }
  ]
  let editConfig = ''
  let watcher: any

  const onSettingUpdate = () => {
    let config = editConfig.replace(/\r\n/gm, '\n')
    commonSetting.value.forEach((item) => {
      const regex = new RegExp(`^[\\s\\n#]?([\\s#]*?)${item.name}(.*?)([^\\n])(\\n|$)`, 'gm')
      if (item.enable) {
        let value = ''
        if (item.isString) {
          value = `${item.name} = "${item.value}"`
        } else {
          value = `${item.name} = ${item.value}`
        }
        if (regex.test(config)) {
          config = config.replace(regex, `${value}\n`)
        } else {
          config = `${value}\n` + config
        }
      } else {
        config = config.replace(regex, ``)
      }
    })
    conf.value.setEditValue(config)
    editConfig = config
  }

  const getCommonSetting = () => {
    if (watcher) {
      watcher()
    }
    let config = editConfig.replace(/\r\n/gm, '\n')
    const arr = [...names].map((item) => {
      const regex = new RegExp(
        `^[\\s\\n]?((?![#;])([\\s]*?))${item.name}(.*?)([^\\n])(\\n|$)`,
        'gm'
      )
      const matchs =
        config.match(regex)?.map((s) => {
          const sarr = s
            .trim()
            .split('=')
            .filter((s) => !!s.trim())
            .map((s) => s.trim())
          const k = sarr.shift()
          const v = sarr.join(' ').replace(';', '').replace('=', '').trim()
          return {
            k,
            v
          }
        }) ?? []
      console.log('getCommonSetting: ', matchs, item.name)
      const find = matchs?.find((m) => m.k === item.name)
      let value = find?.v ?? item.value
      if (item.isString) {
        value = value.replace(new RegExp(`"`, 'g'), '').replace(new RegExp(`'`, 'g'), '')
      }
      item.enable = !!find
      item.value = value
      item.key = uuid()
      return item
    })
    commonSetting.value = reactive(arr) as any
    watcher = watch(commonSetting, debounce(onSettingUpdate, 500), {
      deep: true
    })
  }

  const onTypeChange = (type: 'default' | 'common', config: string) => {
    console.log('onTypeChange: ', type, config)
    if (editConfig !== config || commonSetting.value.length === 0) {
      editConfig = config
      getCommonSetting()
    }
  }

  const fileExists = ref(false)
  watch(
    file,
    (val) => {
      fs.existsSync(val).then((res) => {
        fileExists.value = res
      })
    },
    {
      immediate: true
    }
  )

  if (flag.value && (!file.value || !fileExists.value)) {
    IPC.send('app-fork:php', 'getIniPath', JSON.parse(JSON.stringify(props.version))).then(
      (key: string, res: any) => {
        console.log(res)
        IPC.off(key)
        if (res.code === 0) {
          ConfStore.phpIniFiles[flag.value] = res.data
          ConfStore.save()
          conf?.value?.update()
        }
      }
    )
  }

  IPC.send('app-fork:php', 'initCACertPEM').then((key: string) => {
    IPC.off(key)
  })

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
