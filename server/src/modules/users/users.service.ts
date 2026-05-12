import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import { normalizePhone } from "../common/contact.utils";
import { AuthService } from "../auth/auth.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly authService: AuthService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<{
    userID: string;
    login: string;
    displayName: string;
    method: AuthMethod;
    contact: string;
    phone: string | null;
  }> {
    const login = this.authService.normalizeLogin(dto.login);
    const displayName = dto.displayName.trim();
    const displayNameLength = Array.from(displayName).length;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;

    if (displayNameLength < 2 || displayNameLength > 40) {
      throw new BadRequestException(
        "Display name must be between 2 and 40 characters",
      );
    }

    const existingLogin = await this.usersRepository.findOneBy({ login });
    if (existingLogin) {
      throw new ConflictException("User with this login already exists");
    }

    if (phone) {
      const existingPhone = await this.usersRepository.findOneBy({ phone });
      if (existingPhone) {
        throw new ConflictException("User with this phone already exists");
      }
    }

    const user = await this.usersRepository.save(
      this.usersRepository.create({
        method: phone ? AuthMethod.PHONE : AuthMethod.EMAIL,
        contact: phone ?? login,
        login,
        phone,
        passwordHash: await this.authService.hashPassword(dto.password),
        telegramChatId: null,
        telegramUsername: null,
        displayName,
      }),
    );

    return {
      userID: user.id,
      login: user.login ?? user.contact,
      displayName: user.displayName,
      method: user.method,
      contact: user.contact,
      phone: user.phone,
    };
  }

  async updateProfile(
    userID: string,
    dto: UpdateProfileDto,
  ): Promise<{ userID: string; displayName: string; phone: string }> {
    const user = await this.usersRepository.findOneBy({
      id: userID as UserEntity["id"],
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }

    const trimmedDisplayName = dto.displayName.trim();
    const length = Array.from(trimmedDisplayName).length;
    if (length < 2) {
      throw new BadRequestException(
        "Display name must be at least 2 characters",
      );
    }
    if (length > 40) {
      throw new BadRequestException(
        "Display name must be 40 characters or fewer",
      );
    }

    user.displayName = trimmedDisplayName;
    const saved = await this.usersRepository.save(user);

    return {
      userID: saved.id,
      displayName: saved.displayName,
      phone: saved.phone ?? saved.contact,
    };
  }
}
