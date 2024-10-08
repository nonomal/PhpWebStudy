<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> Composer </span>
          <el-button class="button" link @click="openURL">
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </div>
        <el-button class="button" link :disabled="isRunning" @click="reGetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': currentType.getListing || brewRunning }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table
      class="service-table"
      height="100%"
      :data="tableData"
      :border="false"
      style="width: 100%"
    >
      <template #empty>
        <template v-if="currentType.getListing">
          {{ I18nT('base.gettingVersion') }}
        </template>
        <template v-else>
          {{ I18nT('util.noVerionsFoundInLib') }}
        </template>
      </template>
      <el-table-column prop="version" width="200">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.version')
          }}</span>
        </template>
        <template #default="scope">
          <span
            :class="{
              current: checkEnvPath(scope.row)
            }"
            style="padding: 2px 12px 2px 24px; display: block"
            >{{ scope.row.version }}</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.path')">
        <template #default="scope">
          <template v-if="scope.row?.path">
            <span
              class="path"
              :class="{
                current: checkEnvPath(scope.row)
              }"
              @click.stop="openDir(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
          <template v-else>
            <div class="cell-progress">
              <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
            </div>
          </template>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="scope.row.installed || scope.row?.path"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            ></yb-icon>
          </div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('base.operation')" width="150">
        <template #default="scope">
          <template v-if="scope.row?.path">
            <ExtSet :item="scope.row" :type="typeFlag" />
          </template>
          <template v-else>
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :loading="scope.row.downing"
              :disabled="scope.row.downing"
              @click="handleEdit(scope.$index, scope.row, scope.row.installed)"
              >{{
                scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install')
              }}</el-button
            >
          </template>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, ComputedRef, reactive } from 'vue'
  import { fetchVerion } from '@/util/Brew'
  import { AppSoftInstalledItem, BrewStore, type OnlineVersionItem } from '@/store/brew'
  import IPC from '@/util/IPC'
  import Base from '@/core/Base'
  import { I18nT } from '@shared/lang'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import { Service } from '@/components/ServiceManager/service'
  import installedVersions from '@/util/InstalledVersions'
  import type { SoftInstalled } from '@/store/brew'
  import ExtSet from '@/components/ServiceManager/EXT/index.vue'
  import { ServiceActionStore } from '../ServiceManager/EXT/store'

  const { shell } = require('@electron/remote')
  const { removeSync, existsSync } = require('fs-extra')
  const { dirname } = require('path')

  const props = defineProps<{
    typeFlag: 'composer'
  }>()

  if (!Service[props.typeFlag]) {
    Service[props.typeFlag] = {
      fetching: false
    }
  }

  const brewStore = BrewStore()

  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const currentType: ComputedRef<AppSoftInstalledItem> = computed(() => {
    return brewStore.module('composer')
  })

  const isRunning = computed(() => {
    return Object.values(currentType?.value?.list?.static ?? {}).some(
      (l: OnlineVersionItem) => l?.downing === true
    )
  })

  const tableData = computed(() => {
    const localList = brewStore.module('composer').installed
    const onLineList = Object.values(currentType?.value?.list?.static ?? {}).filter(
      (i) => !i.installed && !localList.find((l) => l.version === i.version)
    )
    return [...localList, ...onLineList]
  })

  const checkEnvPath = (item: SoftInstalled) => {
    console.log('checkEnvPath: ', ServiceActionStore.allPath, dirname(item.bin))
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const fetchData = () => {
    currentType.value.getListing = true
    fetchVerion(props.typeFlag).then((data) => {
      const list: any = currentType.value.list.static
      for (const k in list) {
        delete list?.[k]
      }
      for (const name in data) {
        list[name] = reactive(data[name])
      }
      currentType.value.getListing = false
    })
    const service = Service[props.typeFlag]
    if (service?.fetching) {
      return
    }
    const data = brewStore.module('composer')
    data.installedInited = false
    installedVersions.allInstalledVersions([props.typeFlag]).then(() => {
      service.fetching = false
    })
  }
  const getData = () => {
    const currentItem = currentType.value
    if (currentItem.getListing) {
      return
    }
    const list = currentItem?.list?.static ?? []
    if (Object.keys(list).length === 0) {
      fetchData()
    }
  }
  const reGetData = () => {
    if (isRunning?.value) {
      return
    }
    const list = currentType.value.list.static
    for (let k in list) {
      delete list[k]
    }
    getData()
  }

  const regetInstalled = () => {
    const service = Service[props.typeFlag]
    if (service?.fetching) {
      return
    }
    service.fetching = true
    const data = brewStore.module('composer')
    data.installedInited = false
    installedVersions.allInstalledVersions([props.typeFlag]).then(() => {
      service.fetching = false
    })
  }

  const handleEdit = (index: number, row: any, installed: boolean) => {
    console.log('row: ', row, installed)
    if (!installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = props.typeFlag
      IPC.send('app-fork:composer', 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          if (res?.code === 200) {
            Object.assign(row, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              regetInstalled()
            }
            row.downing = false
          }
        }
      )
    } else {
      Base._Confirm(I18nT('base.delAlertContent'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
        .then(() => {
          try {
            if (existsSync(row.appDir)) {
              removeSync(row.appDir)
            }
            row.installed = false
            regetInstalled()
            MessageSuccess(I18nT('base.success'))
          } catch (e) {
            MessageError(I18nT('base.fail'))
          }
        })
        .catch(() => {})
    }
  }

  const openURL = () => {
    shell.openExternal('https://getcomposer.org/download/')
  }

  getData()
  ServiceActionStore.fetchPath()
</script>
