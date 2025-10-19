# Target IDs Configuration

## Overview
Target IDs are special users whose messages and media will be saved permanently on the server (database + file storage). Regular users' data is only stored temporarily during processing and immediately deleted.

## Configuration File: `target_ids.json`

### Format
```json
[
  {
    "target": {
      "id": null,
      "userID": "username_here",
      "phone": "+998901234567"
    }
  },
  {
    "target": {
      "id": 123456789,
      "userID": null,
      "phone": null
    }
  }
]
```

### Fields
- **id**: Telegram user ID (numeric). Can be `null` if unknown.
- **userID**: Telegram username (without @). Can be `null` if unknown.
- **phone**: Phone number with country code (e.g., `+998901234567`). Can be `null` if unknown.

**Important:** At least ONE field must be non-null for each target.

## How It Works

### 1. Initial Configuration
Create `target_ids.json` with known information:
```json
[
  {
    "target": {
      "id": null,
      "userID": "john_doe",
      "phone": null
    }
  },
  {
    "target": {
      "id": null,
      "userID": null,
      "phone": "+998955984455"
    }
  }
]
```

### 2. Auto-Resolution
When a user matching the username or phone number sends/receives a message:
- System automatically resolves the Telegram ID
- Updates the JSON file with resolved ID
- Starts saving messages and media to permanent storage

### 3. After Resolution
```json
[
  {
    "target": {
      "id": 123456789,
      "userID": "john_doe",
      "phone": "+998901234567"
    }
  },
  {
    "target": {
      "id": 987654321,
      "userID": "username123",
      "phone": "+998955984455"
    }
  }
]
```

## Storage Behavior

### For Target Users:
1. ✅ Messages saved to database
2. ✅ Media saved to: `target_archives/user_X/contact_Y/`
3. ✅ Full metadata stored (including file paths)
4. ✅ Permanent retention

### For Non-Target Users:
1. ❌ NO database storage
2. ❌ NO permanent media files
3. ✅ Temporary processing (auto-deleted)
4. ✅ Still archived to Telegram channels

## Example Use Cases

### Case 1: Know only phone number
```json
{
  "target": {
    "id": null,
    "userID": null,
    "phone": "+998901234567"
  }
}
```
System will resolve ID and username on first contact.

### Case 2: Know only username
```json
{
  "target": {
    "id": null,
    "userID": "example_user",
    "phone": null
  }
}
```
System will resolve ID and phone on first contact.

### Case 3: Know Telegram ID
```json
{
  "target": {
    "id": 123456789,
    "userID": null,
    "phone": null
  }
}
```
Immediately active, will resolve username/phone on contact.

## Privacy & Security

- ✅ File is in `.gitignore` - never committed to version control
- ✅ Only specified users are tracked
- ✅ Regular users have complete privacy
- ✅ No server-side storage for non-targets
- ⚠️ Keep this file secure and backed up separately

## Management

### Adding New Target
1. Edit `target_ids.json`
2. Add new entry with known information
3. Save file
4. Restart application or wait for auto-reload

### Removing Target
1. Delete entry from `target_ids.json`
2. Save file
3. Optionally delete: `target_archives/user_X/contact_Y/`
4. Optionally remove from database

### Checking Targets
Check logs for:
```
[TargetIDs] Loaded target IDs from JSON file
[TargetIDs] Resolved target ID
```

## Notes

- Phone numbers must include country code (e.g., `+998`, not `998`)
- Usernames are case-sensitive
- System automatically normalizes phone numbers for matching
- File is reloaded automatically after changes (if implemented)
- Invalid entries (all fields null) are skipped with warning
