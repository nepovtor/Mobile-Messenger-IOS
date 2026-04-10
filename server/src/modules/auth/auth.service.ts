import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../../entities/user.entity";
import { buildDisplayName, normalizeContact } from "../common/contact.utils";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async requestCode(dto: RequestAuthDto): Promise<{ expiresIn: number }> {
    normalizeContact(dto.method, dto.contact);
    return { expiresIn: 300 };
  }

  async verifyCode(dto: VerifyAuthDto): Promise<{
    token: string;
    userID: string;
    displayName: string;
  }> {
    const normalizedContact = normalizeContact(dto.method, dto.contact);
    const expectedCode = process.env.AUTH_TEST_CODE || "1111";

    if (dto.code !== expectedCode) {
      throw new UnauthorizedException("Invalid verification code");
    }

    let user = await this.usersRepository.findOne({
      where: { method: dto.method, contact: normalizedContact },
    });

    if (!user) {
      user = this.usersRepository.create({
        method: dto.method,
        contact: normalizedContact,
        displayName: buildDisplayName(dto.method, normalizedContact),
      });
      user = await this.usersRepository.save(user);
    }

    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        displayName: user.displayName,
        contact: user.contact,
        method: user.method,
      },
      {
        secret: process.env.JWT_SECRET || "dev-secret",
        expiresIn: "30d",
      },
    );

    return {
      token,
      userID: user.id,
      displayName: user.displayName,
    };
  }

  async getMe(userID: string): Promise<{
    userID: string;
    displayName: string;
    contact: string;
    method: string;
  }> {
    const user = await this.usersRepository.findOneBy({
      id: userID as UserEntity["id"],
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }

    return {
      userID: user.id,
      displayName: user.displayName,
      contact: user.contact,
      method: user.method,
    };
  }
}
