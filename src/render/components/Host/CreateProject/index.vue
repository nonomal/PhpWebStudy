<template>
  <el-dialog
    v-model="show"
    :title="$t('host.newProject')"
    width="600px"
    :destroy-on-close="true"
    custom-class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <div class="main">
          <div class="path-choose mt-20 mb-20">
            <input
              type="text"
              class="input"
              placeholder="root path"
              readonly=""
              :value="form.dir"
            />
            <div class="icon-block" @click="chooseRoot()">
              <yb-icon
                :svg="import('@/svg/folder.svg?raw')"
                class="choose"
                width="18"
                height="18"
              />
            </div>
          </div>
          <div class="park">
            <div class="title">
              <span>{{ $t('host.frameWork') }}</span>
            </div>
            <el-select v-model="form.framework" :disabled="loading || created">
              <template v-for="(v, k) in Versions" :key="k">
                <el-option-group :label="k">
                  <template v-for="(item, i) in v" :key="i">
                    <el-option :value="`${k}-${item.version}`" :label="item.name"></el-option>
                  </template>
                </el-option-group>
              </template>
            </el-select>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <template v-if="!created">
          <el-button @click="show = false">{{ $t('base.cancel') }}</el-button>
          <el-button
            :loading="loading"
            :disabled="!createAble"
            type="primary"
            @click="doCreateProject"
            >{{ $t('base.confirm') }}</el-button
          >
        </template>
        <template v-else>
          <el-button @click="show = false">{{ $t('base.confirm') }}</el-button>
          <el-button type="primary" @click="doCreateHost">{{ $t('host.toCreateHost') }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import Versions from './version'
  import IPC from '@/util/IPC'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'

  const { join } = require('path')
  const { dialog } = require('@electron/remote')
  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const form = ref({
    dir: '',
    framework: 'wordpress-*'
  })

  const created = ref(false)
  const loading = ref(false)
  const createAble = computed(() => {
    return !!form.value.dir && !!form.value.framework
  })

  const chooseRoot = () => {
    if (loading.value || created.value) {
      return
    }
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.dir = path
      })
  }
  let msg: any = ''
  const doCreateProject = () => {
    console.log('doCreateProject: ', form.value)
    loading.value = true
    const frameworks = form.value.framework.split('-')
    IPC.send(
      'app-fork:project',
      'createProject',
      form.value.dir,
      frameworks[0],
      frameworks[1]
    ).then((key: string, res: any) => {
      if (res?.code === 0) {
        IPC.off(key)
        ElMessage.success(I18nT('base.success'))
        loading.value = false
        created.value = true
      } else if (res?.code === 1) {
        IPC.off(key)
        ElMessage({
          type: 'error',
          message: msg ?? I18nT('base.fail'),
          customClass: 'cli-to-html'
        })
        loading.value = false
      } else {
        msg = res?.msg
      }
    })
  }
  const doCreateHost = () => {
    const framework = form.value.framework
    let dir = form.value.dir
    let nginxRewrite = ''
    if (framework.includes('wordpress')) {
      dir = join(form.value.dir, 'wordpress')
      nginxRewrite = `location /
{
\t try_files $uri $uri/ /index.php?$args;
}

rewrite /wp-admin$ $scheme://$host$uri/ permanent;`
    } else if (framework.includes('laravel')) {
      dir = join(form.value.dir, 'public')
      nginxRewrite = `location / {
\ttry_files $uri $uri/ /index.php$is_args$query_string;
}`
    } else if (framework.includes('yii2')) {
      dir = join(form.value.dir, 'web')
      nginxRewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
}`
    } else if (framework.includes('thinkphp')) {
      dir = join(form.value.dir, 'public')
      nginxRewrite = `location / {
\tif (!-e $request_filename){
\t\trewrite  ^(.*)$  /index.php?s=$1  last;   break;
\t}
}`
    } else if (framework.includes('symfony')) {
      dir = join(form.value.dir, 'public')
      nginxRewrite = `location / {
        try_files $uri /index.php$is_args$args;
}`
    } else if (framework.includes('cakephp')) {
      dir = join(form.value.dir, 'webroot')
      nginxRewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
}`
    } else if (framework.includes('slim')) {
      dir = join(form.value.dir, 'public')
      nginxRewrite = `location / {
        try_files $uri /index.php$is_args$args;
}`
    } else if (framework.includes('codeIgniter')) {
      dir = join(form.value.dir, 'public')
      nginxRewrite = `location / {
        try_files $uri $uri/ /index.php$is_args$args;
}`
    }
    callback({
      dir,
      rewrite: nginxRewrite
    })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
<style lang="scss">
  .host-edit.new-project {
    width: 500px;
    height: auto;

    .el-dialog__body {
      padding: 5px 10px;
    }
  }
</style>