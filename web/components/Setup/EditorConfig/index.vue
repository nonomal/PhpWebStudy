<template>
  <div class="setup-common editor-config">
    <div class="main proxy-set">
      <el-form label-width="130px" label-position="left" @submit.prevent>
        <el-form-item :label="$t(' base.theme')">
          <el-radio-group v-model="editorConfig.theme">
            <el-radio-button label="vs-dark" />
            <el-radio-button label="vs-light" />
            <el-radio-button label="hc-black" />
            <el-radio-button label="hc-light" />
            <el-radio-button label="auto">{{ $t('util.auto') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="$t('util.fontSize')">
          <el-input v-model.number="editorConfig.fontSize" type="number"></el-input>
        </el-form-item>
        <el-form-item :label="$t('util.lineHeight')">
          <el-input v-model.number="editorConfig.lineHeight" type="number"></el-input>
        </el-form-item>
      </el-form>
    </div>
    <div ref="wapper" class="editor-wapper"></div>
  </div>
</template>

<script lang="ts" setup>
  import { AppStore } from '@web/store/app'
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMap } from './store'
  import Conf from '@web/config/apache.conf.txt?raw'
  import { EditorCreate } from '@web/fn'

  const wapper = ref()
  const appStore = AppStore()
  const editorConfig = computed({
    get() {
      return appStore.editorConfig
    },
    set() {}
  })
  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const initEditor = () => {
    monacoInstance = EditorCreate(wapper.value, {
      value: EditorConfigMap.text,
      language: 'ini',
      scrollBeyondLastLine: false,
      overviewRulerBorder: true,
      automaticLayout: true,
      theme: editorConfig.value.theme,
      fontSize: editorConfig.value.fontSize,
      lineHeight: editorConfig.value.lineHeight
    })
  }

  onMounted(() => {
    if (!EditorConfigMap.text) {
      EditorConfigMap.text = Conf
      initEditor()
    } else {
      initEditor()
    }
  })

  onUnmounted(() => {
    monacoInstance?.dispose()
    monacoInstance = null
  })

  watch(
    editorConfig,
    () => {
      monacoInstance?.updateOptions({
        theme: editorConfig.value.theme,
        fontSize: editorConfig.value.fontSize,
        lineHeight: editorConfig.value.lineHeight
      })
    },
    {
      deep: true
    }
  )
</script>
