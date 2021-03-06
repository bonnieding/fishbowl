import { BaseModel, Collection, FirestoreData } from "@shared/models/Model";
import { DocumentSnapshot } from "@shared/util/FirestoreUtil";
import Player from "@shared/models/Player";
import Logger from "@shared/Logger";
import { shuffleArray } from "@shared/util/ObjectUtil";

export interface WordEntry {
    word: string;
    userId: string;
}

export enum Phase {
    SETUP = 0,
    IN_PROGRESS = 1,
    FINISHED = 2
}

enum Field {
    phase = "phase",
    players = "players",
    round = "round"
}

export const ROUND_DURATION_SECONDS = 60;

const logger = new Logger("Game.ts");

export class Game extends BaseModel {
    readonly collection = Collection.games;
    static Field = Field;
    name?: string;
    phase: Phase = Phase.SETUP;
    numberOfTeams = 2;
    players: { [userId: string]: Player } = {};
    words: WordEntry[] = [];
    round = 0;

    remainingWordsInRound: WordEntry[] = [];
    currentTeam = 0;
    currentPlayerByTeam: { [team: number]: string } = {};

    scores: { [team: number]: number } = {};

    isPlaying = false;
    turnEndsAt: Date | undefined | null;
    turnStartsAt: Date | undefined | null;

    videoChatUrl: string | undefined;

    get playersList(): Player[] {
        return Object.values(this.players);
    }

    incrementScore(userId: string) {
        const player = this.getPlayer(userId);
        const team = player?.team;
        if (team !== undefined && team !== null) {
            this.scores[team] = (this.scores[team] ?? 0) + 1;
        }

        player?.incrementScore();
    }

    allPlayersInPhase(phase: Phase): boolean {
        return !this.playersList.some(p => p.phase !== phase);
    }

    startTurn() {
        if (this.remainingWordsInRound.length === 0) {
            this.moveToNextRound();
            return;
        }

        this.isPlaying = true;
        const countdown = 10000;
        this.turnStartsAt = new Date(Date.now() + countdown);
        this.turnEndsAt = new Date(
            Date.now() + ROUND_DURATION_SECONDS * 1000 + countdown
        );
    }

    endTurn() {
        logger.info("Ending turn");
        this.isPlaying = false;
        this.turnEndsAt = null;
        this.turnStartsAt = null;

        this.updateNextTeams();
    }

    /**
     * remove the word from the array of remaining words.
     * @param {WordEntry} wordEntry
     * @return {boolean} true if the word was removed, false if it was not.
     */
    completeWord(wordEntry: WordEntry): boolean {
        logger.info("Completing word ", wordEntry);
        const startingCount = this.remainingWordsInRound.length;
        this.remainingWordsInRound = [...this.remainingWordsInRound].filter(
            w => wordEntry.word !== w.word || w.userId !== wordEntry.userId
        );
        const endingCount = this.remainingWordsInRound.length;
        return endingCount < startingCount;
    }

    addWord(wordEntry: WordEntry): boolean {
        const _word = wordEntry.word.toLowerCase().toLowerCase();
        const existing = this.words.find(w => {
            return (
                w.userId === wordEntry.userId &&
                w.word.toLowerCase().trim() === _word
            );
        });
        if (existing) {
            return false;
        }

        this.words.push(wordEntry);

        return true;
    }

    getActivePlayer(): Player | undefined {
        const team = this.currentTeam;
        const currentPlayerId = this.currentPlayerByTeam[team];
        if (!currentPlayerId) {
            return Object.values(this.players).find(p => p.team === team);
        }

        return this.players[currentPlayerId];
    }

    getCurrentWord(): WordEntry | undefined {
        if (this.remainingWordsInRound.length > 0) {
            return this.remainingWordsInRound[0];
        }
        return undefined;
    }

    /**
     * Adds a player to this game.
     * @param {Player} player
     */
    addPlayer(player: Player) {
        this.players[player.userId] = player;
    }

    getWordsForUser(userId?: string): WordEntry[] {
        if (!userId) {
            return [];
        }
        return this.words.filter(w => w.userId === userId);
    }

    removePlayer(userId: string) {
        const updatedPlayers = { ...this.players };
        delete updatedPlayers[userId];
        this.players = updatedPlayers;
    }

    getPlayer(userId: string): Player | undefined {
        return this.players[userId];
    }

    updateNextTeams() {
        const currentTeam = this.currentTeam;
        let nextTeam = currentTeam + 1;
        if (nextTeam >= this.numberOfTeams) {
            nextTeam = 0;
        }
        this.currentTeam = nextTeam;
        Object.keys(this.currentPlayerByTeam)
            .map(Number)
            .forEach(team => {
                const userId = this.currentPlayerByTeam[team];
                const playersOnTeam = Object.values(this.players).filter(
                    p => p.team === team
                );
                const currentIndex = playersOnTeam.findIndex(
                    p => p.userId === userId
                );
                const nextIndex = Math.min(
                    playersOnTeam.length - 1,
                    Math.max(0, currentIndex + 1)
                );
                const nextPlayer = playersOnTeam[nextIndex];
                this.currentPlayerByTeam[team] = nextPlayer.userId;
            });
    }

    moveToNextRound() {
        this.remainingWordsInRound = shuffleArray([...this.words]);
        this.round = this.round + 1;
    }

    wordsByUser(userId: string): WordEntry[] {
        return this.words.filter(w => w.userId === userId);
    }

    restart() {
        this.phase = Phase.SETUP;
        this.round = 0;
        this.playersList.forEach(p => {
            p.reset();
        });

        this.scores = {};
        this.currentTeam = 0;
        this.remainingWordsInRound = [];
        this.words = [];
        this.isPlaying = false;
        this.turnStartsAt = undefined;
        this.turnEndsAt = undefined;
        this.currentPlayerByTeam = {};
    }

    static fromData(data: FirestoreData): Game {
        return super.create(data, Game);
    }

    prepareFromFirestore(data: FirestoreData) {
        super.prepareFromFirestore(data);
        this.players = this.playersList.reduce(
            (map: { [id: string]: Player }, player) => {
                const p = new Player(player.userId);
                map[player.userId] = Object.assign(p, player);

                return map;
            },
            {}
        );
    }

    static fromSnapshot(snapshot: DocumentSnapshot): Game {
        const id = snapshot.id;
        const data = snapshot.data() || {};
        return super.create(data, Game, id);
    }
}
