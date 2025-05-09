import IPC from '@/util/IPC.js'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { AppStore } from '@/store/app'
import { reactive } from 'vue'
import { isEqual } from 'lodash'
import type { AllAppModule } from '@/core/type'
import { AppModuleEnum } from '@/core/type'

class InstalledVersions {
  _cb: Array<Function>
  taskRunning: boolean
  runningFlags: Array<Array<AllAppModule>>
  constructor() {
    this._cb = []
    this.runningFlags = []
    this.taskRunning = false
  }
  private callBack() {
    this._cb.forEach((cb) => {
      cb(true)
    })
    this._cb.splice(0)
    this.runningFlags.splice(0)
    this.taskRunning = false
  }
  allInstalledVersions(flags: Array<AllAppModule>) {
    if (this.taskRunning && this.runningFlags.find((f) => isEqual(f, flags))) {
      return new Promise((resolve) => {
        this._cb.push(resolve)
      })
    }
    this.runningFlags.push(flags)
    this.taskRunning = true

    const brewStore = BrewStore()
    const appStore = AppStore()
    const setup = JSON.parse(JSON.stringify(AppStore().config.setup))
    const arrs = flags.filter((f) => !brewStore.module(f).installedInited)
    if (arrs.length === 0) {
      setTimeout(() => {
        this.callBack()
      }, 30)
      return new Promise((resolve) => {
        this._cb.push(resolve)
      })
    }
    IPC.send('app-fork:version', 'allInstalledVersions', arrs, setup).then(
      (key: string, res: any) => {
        IPC.off(key)
        const versions: { [key in AppModuleEnum]: Array<SoftInstalled> } = res?.data ?? {}
        let needSaveConfig = false
        for (const f in versions) {
          const flag: AllAppModule = f as AllAppModule
          let installed = versions[flag]
          const data = brewStore.module(flag)
          const old = [...data.installed]
          installed = installed.map((item) => {
            const find = old.find((o) => o.path === item.path && o.version === item.version)
            Object.assign(item, find)
            return reactive(item)
          })
          data.installed.splice(0)
          data.installed.push(...installed)
          data.installedInited = true
          old.splice(0)
          const server = appStore.serverCurrent(flag)
          if (flag !== 'php' && data.installed.length > 0) {
            const currentVersion = server?.current?.version
            const currentPath = server?.current?.path
            const findCurrent =
              currentVersion &&
              currentPath &&
              data.installed.find(
                (d) =>
                  d.version && d.enable && d.version === currentVersion && d.path === currentPath
              )
            if (!findCurrent) {
              const find = data.installed.find((d) => d.version && d.enable)
              if (find) {
                appStore.UPDATE_SERVER_CURRENT({
                  flag: flag,
                  data: JSON.parse(JSON.stringify(find))
                })
                needSaveConfig = true
              }
            }
          }
        }
        if (needSaveConfig) {
          appStore.saveConfig()
        }
        this.callBack()
      }
    )
    return new Promise((resolve) => {
      this._cb.push(resolve)
    })
  }
}

export default new InstalledVersions()
