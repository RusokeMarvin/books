// src/utils/auth.ts

import { fyo } from 'src/initFyo';
import { showToast, showDialog } from './interactive';

export interface UserSession {
  email: string;
  name: string;
  roles: string[];
  lastLogin: Date;
}

export class AuthManager {
  private static instance: AuthManager;
  private currentUser: UserSession | null = null;

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  async login(email: string, password: string): Promise<UserSession | null> {
    // Hardcoded admin credentials
    const ADMIN_CREDENTIALS = {
      email: 'admin@smartfric.com',
      password: 'admin@123',
      name: 'Administrator',
      roles: ['Administrator']
    };

    // Check admin credentials first
    if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
      this.currentUser = {
        email: ADMIN_CREDENTIALS.email,
        name: ADMIN_CREDENTIALS.name,
        roles: ADMIN_CREDENTIALS.roles,
        lastLogin: new Date()
      };
      return this.currentUser;
    }

    // Check User documents
    try {
      const userDocs = await fyo.db.getAll('User', {
        filters: { email: email.toLowerCase().trim() },
        fields: ['name', 'username', 'email', 'password', 'roles', 'is_active']
      });

      if (userDocs.length === 0) {
        return null;
      }

      const user: any = userDocs[0];
      
      // Check if user is active
      if (!user.is_active) {
        showToast({
          message: 'Account is disabled. Please contact administrator.',
          type: 'error'
        });
        return null;
      }

      // Direct password comparison (simplified - remove hashing for now)
      if (user.password === password) {
        // Update last login
        try {
          await fyo.db.update('User', {
            name: user.name as string,
            last_login: new Date().toISOString()
          });
        } catch (updateError) {
          console.log('Could not update last login:', updateError);
        }

        this.currentUser = {
          email: user.email as string,
          name: user.username as string,
          roles: [user.roles as string],
          lastLogin: new Date()
        };
        
        return this.currentUser;
      }
    } catch (error) {
      console.error('Authentication error:', error);
    }

    return null;
  }

  logout(): void {
    this.currentUser = null;
    localStorage.removeItem('frappe-books:authenticated');
    localStorage.removeItem('frappe-books:userData');
    localStorage.removeItem('frappe-books:userRole');
  }

  getCurrentUser(): UserSession | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  hasRole(role: string): boolean {
    if (!this.currentUser) return false;
    return this.currentUser.roles.includes(role);
  }

  isAdmin(): boolean {
    return this.hasRole('Administrator');
  }

  async createUser(userData: {
    username: string;
    email: string;
    password: string;
    roles: string;
  }): Promise<boolean> {
    try {
      // Create user document using fyo.doc.getNewDoc
      const doc = fyo.doc.getNewDoc('User', {
        username: userData.username,
        email: userData.email,
        password: userData.password, // Store plain password for now
        roles: userData.roles,
        is_active: true
      });

      await doc.sync();
      return true;
    } catch (error) {
      console.error('Error creating user:', error);
      return false;
    }
  }

  async resetPassword(email: string, newPassword: string): Promise<boolean> {
    try {
      const userDocs = await fyo.db.getAll('User', {
        filters: { email: email },
        fields: ['name']
      });

      if (userDocs.length === 0) {
        return false;
      }

      const user = userDocs[0] as any;

      await fyo.db.update('User', {
        name: user.name as string,
        password: newPassword
      });

      return true;
    } catch (error) {
      console.error('Error resetting password:', error);
      return false;
    }
  }
}

// Export singleton instance
export const authManager = AuthManager.getInstance();