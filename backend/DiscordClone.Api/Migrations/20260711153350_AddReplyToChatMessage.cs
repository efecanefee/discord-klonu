using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DiscordClone.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReplyToChatMessage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ShowLastSeen",
                table: "users",
                newName: "show_last_seen");

            migrationBuilder.RenameColumn(
                name: "CustomStatusMessage",
                table: "users",
                newName: "custom_status_message");

            migrationBuilder.AddColumn<bool>(
                name: "is_private",
                table: "rooms",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "room_code",
                table: "rooms",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "reply_to_id",
                table: "messages",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_rooms_room_code",
                table: "rooms",
                column: "room_code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_rooms_room_code",
                table: "rooms");

            migrationBuilder.DropColumn(
                name: "is_private",
                table: "rooms");

            migrationBuilder.DropColumn(
                name: "room_code",
                table: "rooms");

            migrationBuilder.DropColumn(
                name: "reply_to_id",
                table: "messages");

            migrationBuilder.RenameColumn(
                name: "show_last_seen",
                table: "users",
                newName: "ShowLastSeen");

            migrationBuilder.RenameColumn(
                name: "custom_status_message",
                table: "users",
                newName: "CustomStatusMessage");
        }
    }
}
