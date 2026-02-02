import { Doc } from 'fyo/model/doc';
import { ListViewSettings } from 'fyo/model/types';

export class User extends Doc {
  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'username', 'email', 'roles', 'password', 'is_active', 'last_login'] };
  }
}
