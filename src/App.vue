<template>
  <div
    id="app"
    class="dark:bg-gray-900 h-screen flex flex-col font-sans overflow-hidden antialiased"
    :dir="languageDirection"
    :language="language"
  >
    <!-- Database Selector (shown first if no database selected) -->
    <DatabaseSelector
      v-if="activeScreen === 'DatabaseSelector'"
      ref="databaseSelector"
      @new-database="newDatabase"
      @file-selected="fileSelected"
    />

    <!-- Setup Wizard -->
    <SetupWizard
      v-if="activeScreen === 'SetupWizard'"
      @setup-complete="setupComplete"
      @setup-canceled="showDbSelector"
    />

    <!-- Login Screen (shown after database is connected) -->
    <LoginScreen
      v-if="activeScreen === 'Login'"
      :db-path="dbPath"
      @login-success="handleLoginSuccess"
      @switch-database="handleSwitchDatabase"
    />

    <!-- Main Application (shown when authenticated) -->
    <div v-if="activeScreen === 'Desk' && isAuthenticated" class="h-full flex flex-col overflow-hidden">
      <!-- User Header - Fixed height -->
      <div class="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div class="px-4 py-2 flex justify-between items-center text-sm">
          <div class="flex items-center space-x-4">
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mr-2">
                <span class="text-blue-600 dark:text-blue-300 font-semibold">
                  {{ userInitials }}
                </span>
              </div>
              <div>
                <p class="font-medium text-gray-800 dark:text-gray-200">
                  {{ currentUser?.name || 'User' }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ currentUser?.email }}
                  <span v-if="userRole" class="ml-2 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
                    {{ userRole }}
                  </span>
                </p>
              </div>
            </div>
          </div>
          
          <div class="flex items-center space-x-3">
            <button
              @click="handleLogout"
              class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium px-3 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <!-- Windows Title Bar -->
      <WindowsTitleBar
        v-if="platform === 'Windows'"
        class="flex-shrink-0"
        :db-path="dbPath"
        :company-name="companyName"
      />

      <!-- Main Contents - Takes remaining space with scroll -->
      <Desk
        class="flex-1 min-h-0 overflow-auto"
        :dark-mode="darkMode"
        @change-db-file="showDbSelector"
      />

      <!-- Render target for toasts -->
      <div
        id="toast-container"
        class="absolute bottom-0 flex flex-col items-end mb-3 pe-6"
        style="width: 100%; pointer-events: none"
      ></div>
    </div>
  </div>
</template>

<script lang="ts">
import { RTL_LANGUAGES } from 'fyo/utils/consts';
import { ModelNameEnum } from 'models/types';
import { systemLanguageRef } from 'src/utils/refs';
import { defineComponent, provide, ref, Ref } from 'vue';
import WindowsTitleBar from './components/WindowsTitleBar.vue';
import { handleErrorWithDialog } from './errorHandling';
import { fyo } from './initFyo';
import DatabaseSelector from './pages/DatabaseSelector.vue';
import Desk from './pages/Desk.vue';
import SetupWizard from './pages/SetupWizard/SetupWizard.vue';
import setupInstance from './setup/setupInstance';
import { SetupWizardOptions } from './setup/types';
import './styles/index.css';
import { connectToDatabase, dbErrorActionSymbols } from './utils/db';
import { initializeInstance } from './utils/initialization';
import * as injectionKeys from './utils/injectionKeys';
import { setLanguageMap } from './utils/language';
import { updateConfigFiles } from './utils/misc';
import { updatePrintTemplates } from './utils/printTemplates';
import { Search } from './utils/search';
import { Shortcuts } from './utils/shortcuts';
import { routeTo } from './utils/ui';
import { useKeys } from './utils/vueUtils';
import { setDarkMode } from 'src/utils/theme';
import { registerInstanceToERPNext, updateERPNSyncSettings } from './utils/erpnextSync';
import { ERPNextSyncSettings } from 'models/baseModels/ERPNextSyncSettings/ERPNextSyncSettings';
import LoginScreen from './components/Login.vue';
import { showToast, showDialog } from './utils/interactive';

enum Screen {
  DatabaseSelector = 'DatabaseSelector',
  SetupWizard = 'SetupWizard',
  Login = 'Login',
  Desk = 'Desk',
}

interface User {
  email: string;
  name?: string;
  roles?: string[];
}

export default defineComponent({
  name: 'App',
  components: {
    Desk,
    SetupWizard,
    DatabaseSelector,
    WindowsTitleBar,
    LoginScreen,
  },
  setup() {
    const keys = useKeys();
    const searcher: Ref<null | Search> = ref(null);
    const shortcuts = new Shortcuts(keys);
    const languageDirection = ref(getLanguageDirection(systemLanguageRef.value));

    provide(injectionKeys.keysKey, keys);
    provide(injectionKeys.searcherKey, searcher);
    provide(injectionKeys.shortcutsKey, shortcuts);
    provide(injectionKeys.languageDirectionKey, languageDirection);

    const databaseSelector = ref<InstanceType<typeof DatabaseSelector> | null>(null);

    return {
      keys,
      searcher,
      shortcuts,
      languageDirection,
      databaseSelector,
    };
  },
  data() {
    return {
      activeScreen: null,
      dbPath: '',
      companyName: '',
      darkMode: false,
      isAuthenticated: false,
      currentUser: null as User | null,
      userRole: '',
      isDatabaseConnected: false,
    } as {
      activeScreen: null | Screen;
      dbPath: string;
      companyName: string;
      darkMode: boolean | undefined;
      isAuthenticated: boolean;
      currentUser: User | null;
      userRole: string;
      isDatabaseConnected: boolean;
    };
  },
  computed: {
    language(): string {
      return systemLanguageRef.value;
    },
    platform(): string {
      if (typeof process !== 'undefined' && process.versions?.electron) {
        return process.platform;
      }
      return 'web';
    },
    userInitials(): string {
      if (!this.currentUser?.name) return 'U';
      return this.currentUser.name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    },
  },
  watch: {
    language(value: string) {
      this.languageDirection = getLanguageDirection(value);
    },
  },
  async mounted() {
    await this.setInitialScreen();
    const darkMode = !!fyo.singles.SystemSettings?.darkMode;
    setDarkMode(darkMode);
    this.darkMode = darkMode;
  },
  methods: {
    async setInitialScreen(): Promise<void> {
      // First, check if we have a last selected database
      const lastSelectedFilePath = fyo.config.get('lastSelectedFilePath', null);

      if (typeof lastSelectedFilePath !== 'string' || !lastSelectedFilePath.length) {
        // No database selected - show database selector
        this.activeScreen = Screen.DatabaseSelector;
        return;
      }

      // Try to connect to the last selected database
      try {
        await this.fileSelected(lastSelectedFilePath, true); // auto = true
      } catch (error) {
        // If connection fails, show database selector
        this.activeScreen = Screen.DatabaseSelector;
      }
    },
    
    async fileSelected(filePath: string, auto: boolean = false): Promise<void> {
      fyo.config.set('lastSelectedFilePath', filePath);
      
      if (!(await ipc.checkDbAccess(filePath))) {
        await showDialog({
          title: this.t`Cannot open file`,
          type: 'error',
          detail: this.t`Smart Books does not have access to the selected file: ${filePath}`,
        });

        fyo.config.set('lastSelectedFilePath', null);
        this.activeScreen = Screen.DatabaseSelector;
        return;
      }

      try {
        await this.connectDatabaseAndShowLoginOrDesk(filePath, auto);
      } catch (error) {
        await handleErrorWithDialog(error, undefined, true, true);
        await this.showDbSelector();
      }
    },
    
    async connectDatabaseAndShowLoginOrDesk(filePath: string, auto: boolean): Promise<void> {
      const { countryCode, error, actionSymbol } = await connectToDatabase(fyo, filePath);

      if (!countryCode && error && actionSymbol) {
        return await this.handleConnectionFailed(error, actionSymbol);
      }

      const setupComplete = await fyo.getValue(
        ModelNameEnum.AccountingSettings,
        'setupComplete'
      );

      if (!setupComplete) {
        this.activeScreen = Screen.SetupWizard;
        return;
      }

      // Database connected, schemas loaded
      this.isDatabaseConnected = true;
      this.dbPath = filePath;
      
      // Initialize instance
      await initializeInstance(filePath, false, countryCode, fyo);
      await updatePrintTemplates(fyo);

      // Check authentication status
      const authStatus = localStorage.getItem('frappe-books:authenticated');
      const userData = localStorage.getItem('frappe-books:userData');
      const userRole = localStorage.getItem('frappe-books:userRole');
      
      if (authStatus === 'true' && userData) {
        // User was previously authenticated
        this.isAuthenticated = true;
        this.currentUser = JSON.parse(userData);
        this.userRole = userRole || '';
        
        // Go straight to desk
        await this.setDesk(filePath);
      } else {
        // Show login screen (database is now connected, schemas are loaded)
        this.activeScreen = Screen.Login;
      }
    },
    
    async handleLoginSuccess(userData: User): Promise<void> {
      this.isAuthenticated = true;
      this.currentUser = userData;
      this.userRole = userData.roles?.[0] || 'Guest';
      
      localStorage.setItem('frappe-books:authenticated', 'true');
      localStorage.setItem('frappe-books:userData', JSON.stringify(userData));
      localStorage.setItem('frappe-books:userRole', this.userRole);
      
      // Now show the desk
      await this.setDesk(this.dbPath);
      
      console.log(`User logged in: ${userData.email} with role: ${this.userRole}`);
    },
    
    async handleLogout(): Promise<void> {
      const confirm = await showDialog({
        title: this.t`Logout`,
        message: this.t`Are you sure you want to logout?`
      });

      // if (!confirm) return;

      // Clear auth data
      localStorage.removeItem('frappe-books:authenticated');
      localStorage.removeItem('frappe-books:userData');
      localStorage.removeItem('frappe-books:userRole');

      this.isAuthenticated = false;
      this.currentUser = null;
      this.userRole = '';
      
      // Show login screen again (database still connected)
      this.activeScreen = Screen.Login;

      showToast({ message: 'Logged out successfully', type: 'success' });
    },

    async handleSwitchDatabase(): Promise<void> {
      // Clear authentication data
      localStorage.removeItem('frappe-books:authenticated');
      localStorage.removeItem('frappe-books:userData');
      localStorage.removeItem('frappe-books:userRole');
      
      this.isAuthenticated = false;
      this.currentUser = null;
      this.userRole = '';
      
      // Show database selector
      await this.showDbSelector();
      
      showToast({ 
        message: 'Please select a database', 
        type: 'info' 
      });
    },

    async setSearcher(): Promise<void> {
      this.searcher = new Search(fyo);
      await this.searcher.initializeKeywords();
    },
    
    async setDesk(filePath: string): Promise<void> {
      await setLanguageMap();
      this.activeScreen = Screen.Desk;
      await this.setDeskRoute();
      await fyo.telemetry.start(true);
      await ipc.checkForUpdates();
      this.companyName = (await fyo.getValue(
        ModelNameEnum.AccountingSettings,
        'companyName'
      )) as string;
      await this.setSearcher();
      updateConfigFiles(fyo);
      
      // Handle ERPNext sync
      const syncSettingsDoc = (await fyo.doc.getDoc(
        ModelNameEnum.ERPNextSyncSettings
      )) as ERPNextSyncSettings;

      const baseURL = syncSettingsDoc.baseURL;
      const token = syncSettingsDoc.authToken;
      const enableERPNextSync = fyo.singles.AccountingSettings?.enableERPNextSync;

      if (enableERPNextSync && baseURL && token) {
        try {
          await registerInstanceToERPNext(fyo);
          await updateERPNSyncSettings(fyo);
          await ipc.initScheduler(
            `${fyo.singles.ERPNextSyncSettings?.dataSyncInterval as string}m`
          );
        } catch (error) {
          showToast({ message: 'Connection Failed', type: 'error' });
        }
      }
    },
    
    newDatabase() {
      this.activeScreen = Screen.SetupWizard;
    },
    
    async setupComplete(setupWizardOptions: SetupWizardOptions): Promise<void> {
      const companyName = setupWizardOptions.companyName;
      const filePath = await ipc.getDbDefaultPath(companyName);
      await setupInstance(filePath, setupWizardOptions, fyo);
      fyo.config.set('lastSelectedFilePath', filePath);
      this.isDatabaseConnected = true;
      this.dbPath = filePath;
      
      // After setup, show login screen
      this.activeScreen = Screen.Login;
    },
    
    async handleConnectionFailed(error: Error, actionSymbol: symbol) {
      await this.showDbSelector();

      if (actionSymbol === dbErrorActionSymbols.CancelSelection) {
        return;
      }

      if (actionSymbol === dbErrorActionSymbols.SelectFile) {
        await this.databaseSelector?.existingDatabase();
        return;
      }

      throw error;
    },
    
    async setDeskRoute(): Promise<void> {
      const { onboardingComplete } = await fyo.doc.getDoc('GetStarted');
      const { hideGetStarted } = await fyo.doc.getDoc('SystemSettings');

      let route = '/get-started';
      if (hideGetStarted || onboardingComplete) {
        route = localStorage.getItem('lastRoute') || '/';
      }

      await routeTo(route);
    },
    
    async showDbSelector(): Promise<void> {
      localStorage.removeItem('lastRoute');
      localStorage.removeItem('frappe-books:authenticated');
      localStorage.removeItem('frappe-books:userData');
      localStorage.removeItem('frappe-books:userRole');

      fyo.config.set('lastSelectedFilePath', null);
      fyo.telemetry.stop();
      await fyo.purgeCache();

      this.activeScreen = Screen.DatabaseSelector;
      this.dbPath = '';
      this.searcher = null;
      this.companyName = '';
      this.isAuthenticated = false;
      this.currentUser = null;
      this.userRole = '';
      this.isDatabaseConnected = false;
    }
  },
});

function getLanguageDirection(language: string): 'rtl' | 'ltr' {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}
</script>