import { SmartContract, State, method, state } from "o1js";
import { MetadataGeoPointCommitment } from "../../../model/public/Commitment";
import { ExactGeolocationMetadataCircuitProof } from "../../../zkprogram/public/Metadata";

export class GeoPointWithMetadataContract extends SmartContract {
    @state(MetadataGeoPointCommitment) geoPointWithMetadata = State<MetadataGeoPointCommitment>();

    @method async submitProof(proof: ExactGeolocationMetadataCircuitProof){
        proof.verify();

        this.geoPointWithMetadata.set(proof.publicOutput);
    }

} 