// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DroneSwarmFHE is SepoliaConfig {
    struct EncryptedDroneState {
        uint256 droneId;
        euint32 encryptedPositionX;
        euint32 encryptedPositionY;
        euint32 encryptedVelocity;
        euint32 encryptedBattery;
        euint32 encryptedSensorData;
        uint256 timestamp;
        address operator;
    }

    struct SwarmDecision {
        euint32 encryptedFormation;
        euint32 encryptedMovement;
        euint32 encryptedPriority;
    }

    struct DecryptedDecision {
        uint32 formation;
        uint32 movement;
        uint32 priority;
        bool isRevealed;
    }

    uint256 public droneCount;
    mapping(uint256 => EncryptedDroneState) public droneStates;
    mapping(uint256 => SwarmDecision) public swarmDecisions;
    mapping(uint256 => DecryptedDecision) public decryptedDecisions;

    mapping(uint256 => uint256) private requestToDroneId;
    
    event DroneRegistered(uint256 indexed droneId, address indexed operator, uint256 timestamp);
    event DecisionComputed(uint256 indexed droneId);
    event DecisionDecrypted(uint256 indexed droneId);

    function registerDrone(address operator) public returns (uint256) {
        droneCount += 1;
        return droneCount;
    }

    function submitEncryptedState(
        euint32 encryptedPositionX,
        euint32 encryptedPositionY,
        euint32 encryptedVelocity,
        euint32 encryptedBattery,
        euint32 encryptedSensorData,
        address operator
    ) public {
        uint256 droneId = registerDrone(operator);
        
        droneStates[droneId] = EncryptedDroneState({
            droneId: droneId,
            encryptedPositionX: encryptedPositionX,
            encryptedPositionY: encryptedPositionY,
            encryptedVelocity: encryptedVelocity,
            encryptedBattery: encryptedBattery,
            encryptedSensorData: encryptedSensorData,
            timestamp: block.timestamp,
            operator: operator
        });

        computeSwarmDecision(droneId);
        emit DroneRegistered(droneId, operator, block.timestamp);
    }

    function computeSwarmDecision(uint256 droneId) private {
        EncryptedDroneState storage state = droneStates[droneId];
        
        swarmDecisions[droneId] = SwarmDecision({
            encryptedFormation: FHE.add(
                FHE.div(state.encryptedPositionX, FHE.asEuint32(10)),
                FHE.div(state.encryptedPositionY, FHE.asEuint32(10))
            ),
            encryptedMovement: FHE.mul(
                state.encryptedVelocity,
                FHE.asEuint32(2)
            ),
            encryptedPriority: FHE.div(
                state.encryptedBattery,
                FHE.asEuint32(5)
            )
        });

        decryptedDecisions[droneId] = DecryptedDecision({
            formation: 0,
            movement: 0,
            priority: 0,
            isRevealed: false
        });

        emit DecisionComputed(droneId);
    }

    function requestDecisionDecryption(uint256 droneId) public {
        require(msg.sender == droneStates[droneId].operator, "Not authorized");
        require(!decryptedDecisions[droneId].isRevealed, "Already decrypted");

        SwarmDecision storage decision = swarmDecisions[droneId];
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(decision.encryptedFormation);
        ciphertexts[1] = FHE.toBytes32(decision.encryptedMovement);
        ciphertexts[2] = FHE.toBytes32(decision.encryptedPriority);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDecision.selector);
        requestToDroneId[reqId] = droneId;
    }

    function decryptDecision(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 droneId = requestToDroneId[requestId];
        require(droneId != 0, "Invalid request");

        DecryptedDecision storage dDecision = decryptedDecisions[droneId];
        require(!dDecision.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        (uint32 formation, uint32 movement, uint32 priority) = 
            abi.decode(cleartexts, (uint32, uint32, uint32));
        
        dDecision.formation = formation;
        dDecision.movement = movement;
        dDecision.priority = priority;
        dDecision.isRevealed = true;

        emit DecisionDecrypted(droneId);
    }

    function getDroneCount() public view returns (uint256) {
        return droneCount;
    }
}