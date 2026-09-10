-- AddLiveTag keys now come only from ADDLIVETAG_API_KEY.
-- Remove any previously encrypted AddLiveTag key; preserve all Saffi history.
UPDATE "aff"."provider_credentials"
SET "ciphertext" = '', "iv" = '', "tag" = ''
WHERE "id" = 'ADDLIVETAG';
