<template>
  <div class="login-container min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
    <div class="w-full max-w-md">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="text-5xl mb-4">📘</div>
        <h1 class="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Smart Books
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Offline Accounting Software
        </p>
      </div>

      <!-- Login Card -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <form @submit.prevent="handleLogin">
          <!-- Email Input -->
          <div class="mb-6">
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email Address
            </label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="you@example.com"
              :class="{ 'border-red-500': errors.email }"
            />
            <p v-if="errors.email" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.email }}
            </p>
          </div>

          <!-- Password Input -->
          <div class="mb-6">
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="••••••••"
              :class="{ 'border-red-500': errors.password }"
            />
            <p v-if="errors.password" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.password }}
            </p>
          </div>

          <!-- Remember Me -->
          <div class="mb-6">
            <label class="flex items-center">
              <input
                v-model="form.rememberMe"
                type="checkbox"
                class="h-4 w-4 text-blue-600 dark:text-blue-400 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-400 dark:bg-gray-700"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Remember this device
              </span>
            </label>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isLoggingIn"
            class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span v-if="isLoggingIn">Signing in...</span>
            <span v-else>Sign in</span>
          </button>

          <!-- Admin Credentials Hint -->
          <div class="mt-4 text-center">
            <p class="text-xs text-gray-500 dark:text-gray-400">
                Use Default admin credentials if no other users exist.
            </p>
          </div>
        </form>

        <!-- Security Note -->
        <div class="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <p class="text-xs text-blue-800 dark:text-blue-300">
            <strong>Note:</strong> Smart Books runs offline. Your data is stored locally on this computer.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, reactive } from 'vue';
import { fyo } from '../initFyo';
import { showToast } from '../utils/interactive';

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface UserData {
  email: string;
  name: string;
  roles: string[];
}

export default defineComponent({
  name: 'LoginScreen',
  emits: ['login-success'],
  setup(props, { emit }) {
    const form = reactive<LoginForm>({
      email: '',
      password: '',
      rememberMe: false,
    });

    const errors = reactive({
      email: '',
      password: '',
    });

    const isLoggingIn = ref(false);

    // Check for remembered email on component mount
    const rememberedEmail = localStorage.getItem('frappe-books:userEmail');
    if (rememberedEmail) {
      form.email = rememberedEmail;
      form.rememberMe = true;
    }

    // Hardcoded administrator credentials
    const ADMIN_CREDENTIALS = {
      email: 'admin@smartfric.com',
      password: 'admin@123',
      name: 'Administrator',
      roles: ['Administrator']
    };

    async function checkUserLogin(email: string, password: string): Promise<UserData | null> {
      try {
        // Check hardcoded admin credentials first
        if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
          return {
            email: ADMIN_CREDENTIALS.email,
            name: ADMIN_CREDENTIALS.name,
            roles: ADMIN_CREDENTIALS.roles
          };
        }

        // Get user data with all required fields
        let user: any = null;
        
        try {
          // Request specific fields we need
          const userDocs = await fyo.db.getAll('User', {
            filters: { email: email.toLowerCase().trim() },
            fields: ['name', 'username', 'email', 'password', 'roles', 'is_active', 'last_login']
          });
          
          console.log('User docs from getAll with filter:', userDocs);
          
          if (Array.isArray(userDocs) && userDocs.length > 0) {
            user = userDocs[0];
          }
        } catch (e) {
          console.error('Error fetching user:', e);
        }

        // Fallback: Try using fyo.doc.getDoc if we have a name but missing fields
        if (user && user.name && !user.password) {
          try {
            console.log('Fetching full user document...');
            user = await fyo.doc.getDoc('User', String(user.name));
          } catch (e) {
            console.error('Error with getDoc approach:', e);
          }
        }

        if (!user) {
          console.log('No user found with email:', email);
          return null;
        }

        console.log('Found user:', user);
        
        // Check if user is active
        const isActive = user.is_active !== false;
        
        if (!isActive) {
          showToast({
            message: 'Account is disabled. Please contact administrator.',
            type: 'error'
          });
          return null;
        }

        // Check password
        if (!user.password) {
          console.log('No password field found for user');
          showToast({
            message: 'Account configuration error. Please contact administrator.',
            type: 'error'
          });
          return null;
        }

        // Direct password comparison
        if (user.password === password) {
          // Update last login
          try {
            if (user.name) {
              await fyo.db.update('User', {
                name: user.name,
                last_login: new Date().toISOString()
              });
            }
          } catch (updateError) {
            console.log('Could not update last login:', updateError);
          }

          return {
            email: user.email,
            name: user.username || user.name || 'User',
            roles: [user.roles || 'Guest']
          };
        }

        console.log('Password does not match');
        return null;
      } catch (error) {
        console.error('Login error:', error);
        return null;
      }
    }

    async function handleLogin() {
      errors.email = '';
      errors.password = '';
      isLoggingIn.value = true;

      if (!form.email.trim()) {
        errors.email = 'Email is required';
        isLoggingIn.value = false;
        return;
      }

      if (!form.password.trim()) {
        errors.password = 'Password is required';
        isLoggingIn.value = false;
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email)) {
        errors.email = 'Please enter a valid email address';
        isLoggingIn.value = false;
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        console.log('Attempting login for:', form.email);
        const userData = await checkUserLogin(form.email, form.password);
        
        if (userData) {
          console.log('Login successful for:', userData.email);
          
          if (form.rememberMe) {
            localStorage.setItem('frappe-books:userEmail', form.email);
          } else {
            localStorage.removeItem('frappe-books:userEmail');
          }

          localStorage.setItem('frappe-books:userData', JSON.stringify(userData));
          localStorage.setItem('frappe-books:authenticated', 'true');
          localStorage.setItem('frappe-books:userRole', userData.roles[0]);

          emit('login-success', userData);
          
          showToast({
            message: `Welcome back, ${userData.name}!`,
            type: 'success'
          });
        } else {
          console.log('Login failed for:', form.email);
          errors.password = 'Invalid email or password';
          showToast({
            message: 'Invalid email or password',
            type: 'error'
          });
        }
      } catch (error) {
        console.error('Login error:', error);
        errors.password = 'Login failed. Please try again.';
        showToast({
          message: 'Login failed. Please try again.',
          type: 'error'
        });
      } finally {
        isLoggingIn.value = false;
      }
    }

    return {
      form,
      errors,
      isLoggingIn,
      handleLogin,
    };
  },
});
</script>

<style scoped>
.login-container {
  background: linear-gradient(135deg, #f6f8fb 0%, #edf1f7 100%);
}

.dark .login-container {
  background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
}
</style>