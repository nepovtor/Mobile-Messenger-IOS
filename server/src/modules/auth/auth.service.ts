import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthMethod, UserEntity } from "../../entities/user.entity";
import { buildDisplayName, normalizeContact } from "../common/contact.utils";
import { LoginAuthDto } from "./dto/login-auth.dto";
import { RequestAuthDto } from "./dto/request-auth.dto";
import { VerifyAuthDto } from "./dto/verify-auth.dto";

type AuthResult = {
  token: string;
  userID: string;
  displayName: string;
};

type DemoAccount = {
  method: AuthMethod;
  contact: string;
  displayName: string;
  password: string;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly demoAccounts: DemoAccount[] = [
    {
      method: AuthMethod.PHONE,
      contact: "+15551230011",
      displayName: "Анна Demo",
      password: "demo1111",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230012",
      displayName: "Борис Demo",
      password: "demo2222",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230013",
      displayName: "Вера Demo",
      password: "demo3333",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230014",
      displayName: "Глеб Demo",
      password: "demo4444",
    },
    {
      method: AuthMethod.PHONE,
      contact: "+15551230015",
      displayName: "Даша Demo",
      password: "demo5555",
    },
  ];

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const account of this.demoAccounts) {
      await this.findOrCreateUser(
        account.method,
        account.contact,
        account.displayName,
      );
    }
  }

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
    const demoAccount = this.findDemoAccount(dto.method, normalizedContact);

    if (dto.code !== expectedCode) {
      throw new UnauthorizedException("Invalid verification code");
    }

    const user = await this.findOrCreateUser(
      dto.method,
      normalizedContact,
      demoAccount?.displayName,
    );

    return this.buildAuthResult(user);
  }

  async login(dto: LoginAuthDto): Promise<AuthResult> {
    const normalizedContact = normalizeContact(dto.method, dto.contact);
    const demoAccount = this.findDemoAccount(dto.method, normalizedContact);
    const password = dto.password.trim();

    if (!demoAccount || password !== demoAccount.password) {
      throw new UnauthorizedException("Invalid demo credentials");
    }

    const user = await this.findOrCreateUser(
      dto.method,
      normalizedContact,
      demoAccount.displayName,
    );

    return this.buildAuthResult(user);
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

  async listContacts(userID: string): Promise<
    Array<{
      userID: string;
      displayName: string;
      contact: string;
      method: AuthMethod;
      isCurrentUser: boolean;
    }>
  > {
    await this.getMe(userID);

    const demoOrder = new Map(
      this.demoAccounts.map((account, index) => [account.contact, index]),
    );

    const demoContacts = new Set(this.demoAccounts.map((account) => account.contact));
    const users = await this.usersRepository.find();

    return users
      .filter((user) => user.id === userID || demoContacts.has(user.contact))
      .sort((left, right) => {
        if (left.id === userID) {
          return -1;
        }
        if (right.id === userID) {
          return 1;
        }

        const leftOrder = demoOrder.get(left.contact);
        const rightOrder = demoOrder.get(right.contact);
        if (
          leftOrder !== undefined &&
          rightOrder !== undefined &&
          leftOrder !== rightOrder
        ) {
          return leftOrder - rightOrder;
        }
        if (leftOrder !== undefined) {
          return -1;
        }
        if (rightOrder !== undefined) {
          return 1;
        }

        return left.displayName.localeCompare(right.displayName);
      })
      .map((user) => ({
        userID: user.id,
        displayName: user.displayName,
        contact: user.contact,
        method: user.method,
        isCurrentUser: user.id === userID,
      }));
  }

  private findDemoAccount(
    method: AuthMethod,
    contact: string,
  ): DemoAccount | undefined {
    return this.demoAccounts.find(
      (account) => account.method === method && account.contact === contact,
    );
  }

  private async findOrCreateUser(
    method: AuthMethod,
    contact: string,
    preferredDisplayName?: string,
  ): Promise<UserEntity> {
    let user = await this.usersRepository.findOne({
      where: { method, contact },
    });

    const displayName =
      preferredDisplayName ?? buildDisplayName(method, contact);

    if (!user) {
      user = this.usersRepository.create({
        method,
        contact,
        displayName,
      });

      return this.usersRepository.save(user);
    }

    if (preferredDisplayName && user.displayName !== preferredDisplayName) {
      user.displayName = preferredDisplayName;
      return this.usersRepository.save(user);
    }

    return user;
  }

  private async buildAuthResult(user: UserEntity): Promise<AuthResult> {
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
}
