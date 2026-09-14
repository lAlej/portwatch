import type { User } from '../../entities/User.js';

export class GetCurrentUser {
  execute(user: User): User {
    return user;
  }
}
