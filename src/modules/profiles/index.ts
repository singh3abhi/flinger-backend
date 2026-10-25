/** Public API of the profiles module. Other modules import only from here. */
export { ProfilesModule } from './profiles.module';
export { ProfilesService } from './profiles.service';
export type { MemberSummary, PublicCard, RankingSignals } from './profiles.service';
export { PublicProfileDto, publicProfileSchema } from './dto/profile.dto';
