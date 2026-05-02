import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../../entities/user.entity";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

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
