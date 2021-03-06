import { Phase } from "@shared/models/Game";

export default class Player {
    userId!: string;
    displayName?: string;
    phase: Phase = Phase.SETUP;
    team?: number | null;
    score = 0;

    constructor(userId: string) {
        this.userId = userId;
        this.phase = Phase.SETUP;
    }

    incrementScore() {
        this.score += 1;
    }

    reset() {
        this.team = null;
        this.score = 0;
        this.phase = Phase.SETUP;
    }
}
