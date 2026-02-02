<template>
  <div
  class="
    py-2
    h-full
    flex
    justify-between
    flex-col
    bg-gray-200
    dark:bg-gray-100
    relative
  "
  :class="{
    'window-drag': platform !== 'Windows',
  }"
>


    <div>
      <!-- Company name -->
      <div
        class="px-4 flex flex-row items-center justify-between mb-4"
        :class="
          platform === 'Mac' && languageDirection === 'ltr' ? 'mt-10' : 'mt-2'
        "
      >
        <h6
          data-testid="company-name"
          class="
            font-semibold
            dark:text-gray-200
            whitespace-nowrap
            overflow-auto
            no-scrollbar
            select-none
          "
        >
          {{ companyName }}
        </h6>
      </div>

      <!-- Sidebar Items -->
      <div v-for="group in groups" :key="group.label" class="mb-1">
  <!-- Group -->
  <div
    class="
      group
      mx-2
      px-3
      h-11
      flex
      items-center
      gap-3
      cursor-pointer
      rounded-lg
      transition-all
      duration-200
      ease-out
      hover:bg-slate-100
      hover:shadow-sm
      hover:-translate-y-[1px]
      dark:hover:bg-slate-800
    "
    :class="
      isGroupActive(group) && !group.items
        ? 'bg-teal-50 dark:bg-slate-800 text-teal-500 dark:text-teal-500 border-s-4 border-teal-400'
        : ''
    "
    @click="routeToSidebarItem(group)"
  >
    <Icon
      class="
        flex-shrink-0
        text-slate-500
        transition-colors
        duration-200
        group-hover:text-indigo-500
      "
      :name="group.icon"
      :size="group.iconSize || '18'"
      :height="group.iconHeight ?? 0"
      :active="!!isGroupActive(group)"
      :darkMode="darkMode"
      :class="isGroupActive(group) && !group.items ? '-ms-1 text-indigo-500' : ''"
    />

    <div
  class="
    text-sm
    font-semibold
    transition-colors
    duration-200
  "
  :class="
    isGroupActive(group) && !group.items
      ? 'text-slate-900 dark:text-slate-100'
      : 'text-slate-700 dark:text-slate-300'
  "
>
  {{ group.label }}
</div>

  </div>

  <!-- Expanded Group -->
  <div v-if="group.items && isGroupActive(group)" class="mt-1">
    <div
      v-for="item in group.items"
      :key="item.label"
      class="
        mx-2
        ps-11
        h-9
        flex
        items-center
        cursor-pointer
        rounded-md
        text-sm
        transition-all
        duration-200
        ease-out
        hover:bg-slate-100
        hover:translate-x-1
        dark:hover:bg-slate-800
      "
      :class="
        isItemActive(item)
          ? 'bg-teal-50 dark:bg-slate-800 text-teal-500 dark:text-teal-500 border-s-4 border-teal-400'
          : 'text-slate-600 dark:text-slate-400'
      "
      @click="routeToSidebarItem(item)"
    >
      <p class="truncate">
        {{ item.label }}
      </p>
    </div>
  </div>
</div>

    </div>

    <!-- Report Issue and DB Switcher -->
    <div class="window-no-drag flex flex-col gap-2 py-2 px-4">
      <button
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="openDocumentation"
      >
        <feather-icon name="help-circle" class="h-4 w-4 flex-shrink-0" />
        <p>
          {{ t`Help` }}
        </p>
      </button>

      <button
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="viewShortcuts = true"
      >
        <feather-icon name="command" class="h-4 w-4 flex-shrink-0" />
        <p>{{ t`Shortcuts` }}</p>
      </button>

      <button
        data-testid="change-db"
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="$emit('change-db-file')"
      >
        <feather-icon name="database" class="h-4 w-4 flex-shrink-0" />
        <p>{{ t`Change DB` }}</p>
      </button>

      <button
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="() => reportIssue()"
      >
        <feather-icon name="flag" class="h-4 w-4 flex-shrink-0" />
        <p>
          {{ t`Report Issue` }}
        </p>
      </button>

      <p
        v-if="showDevMode"
        class="text-xs text-gray-500 select-none cursor-pointer"
        @click="showDevMode = false"
        title="Open dev tools with Ctrl+Shift+I"
      >
        dev mode
      </p>
    </div>

    <!-- Hide Sidebar Button -->
    <button
      class="
        absolute
        bottom-0
        end-0
        text-gray-600
        dark:text-gray-500
        hover:bg-gray-100
        dark:hover:bg-gray-875
        rounded
        p-1
        m-4
        rtl-rotate-180
      "
      @click="() => toggleSidebar()"
    >
      <feather-icon name="chevrons-left" class="w-4 h-4" />
    </button>

    <Modal :open-modal="viewShortcuts" @closemodal="viewShortcuts = false">
      <ShortcutsHelper class="w-form" />
    </Modal>
  </div>
</template>
<script lang="ts">
import { reportIssue } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import { languageDirectionKey, shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathRef } from 'src/utils/refs';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { routeTo, toggleSidebar } from 'src/utils/ui';
import { defineComponent, inject } from 'vue';
import router from '../router';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

export default defineComponent({
  components: {
    Icon,
    Modal,
    ShortcutsHelper,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  emits: ['change-db-file', 'toggle-darkmode'],
  setup() {
    return {
      languageDirection: inject(languageDirectionKey),
      shortcuts: inject(shortcutsKey),
    };
  },
  data() {
    return {
      companyName: '',
      groups: [],
      viewShortcuts: false,
      activeGroup: null,
      showDevMode: false,
    } as {
      companyName: string;
      groups: SidebarConfig;
      viewShortcuts: boolean;
      activeGroup: null | SidebarRoot;
      showDevMode: boolean;
    };
  },
  computed: {
    appVersion() {
      return fyo.store.appVersion;
    },
  },
  async mounted() {
    const { companyName } = await fyo.doc.getDoc('AccountingSettings');
    this.companyName = companyName as string;
    this.groups = await getSidebarConfig();

    this.setActiveGroup();
    router.afterEach(() => {
      this.setActiveGroup();
    });

    this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyH'], () => {
      if (document.body === document.activeElement) {
        this.toggleSidebar();
      }
    });
    this.shortcuts?.set(COMPONENT_NAME, ['F1'], () => this.openDocumentation());

    this.showDevMode = this.fyo.store.isDevelopment;
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  methods: {
    routeTo,
    reportIssue,
    toggleSidebar,
    openDocumentation() {
      ipc.openLink('https://docs.frappe.io/' + docsPathRef.value);
    },
    setActiveGroup() {
      const { fullPath } = this.$router.currentRoute.value;
      const fallBackGroup = this.activeGroup;
      this.activeGroup =
        this.groups.find((g) => {
          if (fullPath.startsWith(g.route) && g.route !== '/') {
            return true;
          }

          if (g.route === fullPath) {
            return true;
          }

          if (g.items) {
            let activeItem = g.items.filter(
              ({ route }) => route === fullPath || fullPath.startsWith(route)
            );

            if (activeItem.length) {
              return true;
            }
          }
        }) ??
        fallBackGroup ??
        this.groups[0];
    },
    isItemActive(item: SidebarItem) {
      const { path: currentRoute, params } = this.$route;
      const routeMatch = currentRoute === item.route;

      const schemaNameMatch =
        item.schemaName && params.schemaName === item.schemaName;

      const isMatch = routeMatch || schemaNameMatch;
      if (params.name && item.schemaName && !isMatch) {
        return currentRoute.includes(`${item.schemaName}/${params.name}`);
      }

      return isMatch;
    },
    isGroupActive(group: SidebarRoot) {
      return this.activeGroup && group.label === this.activeGroup.label;
    },
    routeToSidebarItem(item: SidebarItem | SidebarRoot) {
      routeTo(this.getPath(item));
    },
    getPath(item: SidebarItem | SidebarRoot) {
      const { route: path, filters } = item;
      if (!filters) {
        return path;
      }

      return { path, query: { filters: JSON.stringify(filters) } };
    },
  },
});
</script>
