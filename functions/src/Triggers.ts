import * as functions from "firebase-functions";
import { Collection } from "@shared/models/Model";
import Logger from "@shared/Logger";
import { Game, Phase } from "@shared/models/Game";
import Player from "@shared/models/Player";

const logger = new Logger("Triggers");

//NOT BEING USED
export const processGameEvent = functions.firestore
    .document(`${Collection.games}/{gameId}`)
    .onWrite(async snapshot => {
        const data = snapshot.after.data();
        if (!data) {
            logger.info("No data was found on the snapshot");
            return;
        }

        logger.info("Handling game on write with data ", JSON.stringify(data));

        const game = Game.fromData(data);
        if (!game || game.phase === Phase.SETUP) {
            logger.info("Game is in setup, no need to process it");
            return;
        }

        if (game.remainingWordsInRound.length === 0) {
            logger.info("going to next round");
            game.moveToNextRound();
            await snapshot.after.ref.set(game.data(), { merge: true });
            return;
        }

        logger.info("There are still words left.. setting next team");
        const currentTeam = game.currentTeam;
        let nextTeam = currentTeam + 1;
        if (nextTeam > game.numberOfTeams) {
            nextTeam = 0;
        }
        game.currentTeam = nextTeam;
        Object.keys(game.currentPlayerByTeam)
            .map(Number)
            .forEach(team => {
                const userId = game.currentPlayerByTeam[team];
                const playersOnTeam = Object.values(game.players).filter(
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
                game.currentPlayerByTeam[team] = nextPlayer.userId;
            });

        await snapshot.after.ref.set(game.data(), { merge: true });
    });

export const setupTeams = functions.firestore
    .document(`${Collection.games}/{gameId}`)
    .onWrite(async snapshot => {
        const data = snapshot.after.data();
        if (!data) {
            logger.info("No data was found on the snapshot");
            return;
        }
        logger.info("Handling game on write with data ", JSON.stringify(data));
        const game = Game.fromData(data);
        if (game.phase === Phase.SETUP) {
            logger.info("Game is in setup, no need to process it");
            return;
        }
        const numTeams = game.numberOfTeams ?? 2;
        const players = Object.values(game.players);
        const teams: { [team: string]: Player[] } = {};

        for (let teamId = 0; teamId < numTeams; teamId++) {
            teams[teamId] = [];
        }

        const unassignedPlayers: Player[] = [];
        players.forEach(p => {
            const team = p.team;
            if (team !== undefined && team !== null) {
                const roster: Player[] = teams[team] ?? [];
                roster.push(p);
                teams[team] = roster;
            } else {
                unassignedPlayers.push(p);
            }
        });

        if (unassignedPlayers.length === 0) {
            logger.info("all players have been assigned, returning");
            return;
        }

        unassignedPlayers.forEach(p => {
            let smallestTeam = 0;
            Object.keys(teams)
                .map(Number)
                .forEach(team => {
                    if (teams[team].length < teams[smallestTeam].length) {
                        smallestTeam = team;
                    }
                });

            p.team = smallestTeam;
            teams[smallestTeam].push(p);
        });

        // const notAssigned = players.find(player => {
        //     return player.phase <= game.phase;
        // });

        logger.info("All have been assigned. saving");

        // const newPhase = Math.min((game.phase += 1), Phase.FINISHED);
        await snapshot.after.ref.set(game.data(), { merge: true });
    });

export const updateGamePhase = functions.firestore
    .document(`${Collection.games}/{gameId}`)
    .onWrite(async snapshot => {
        const data = snapshot.after.data();
        if (!data) {
            logger.info("No data was found on the snapshot");
            return;
        }
        logger.info("Handling game on write with data ", JSON.stringify(data));
        const game = Game.fromData(data);
        if (game.phase !== Phase.SETUP) {
            logger.info("Game is not in setup, no need to process it");
            return;
        }

        const players = Object.values(game.players);
        if (players.length < 2) {
            logger.info("not enough players in the game yet");
            return;
        }

        const notReady = players.find(player => {
            return player.phase <= game.phase;
        });
        if (!!notReady) {
            logger.info("Some players not not ready. can not continue");
            return;
        }

        logger.info("All players are ready, continuing");

        game.phase = Math.min((game.phase += 1), Phase.FINISHED);

        game.remainingWordsInRound = [...game.words];

        // await snapshot.after.ref.update({ [Game.Field.phase]: newPhase });
        await snapshot.after.ref.set(game.data(), { merge: true });
    });
