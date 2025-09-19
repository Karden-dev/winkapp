-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Hôte : 127.0.0.1
-- Généré le : ven. 19 sep. 2025 à 10:13
-- Version du serveur : 10.4.32-MariaDB
-- Version de PHP : 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `winkdb`
--

-- --------------------------------------------------------

--
-- Structure de la table `cash_transactions`
--

CREATE TABLE `cash_transactions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('remittance','expense','manual_withdrawal') NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `comment` text DEFAULT NULL,
  `status` enum('pending','confirmed') NOT NULL DEFAULT 'confirmed',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `validated_by` int(11) DEFAULT NULL,
  `validated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `cash_transactions`
--

INSERT INTO `cash_transactions` (`id`, `user_id`, `type`, `category_id`, `amount`, `comment`, `status`, `created_at`, `validated_by`, `validated_at`) VALUES
(1, 9, 'remittance', NULL, 10000.00, 'Versement en attente pour la commande n°33', 'confirmed', '2025-09-18 20:52:13', 1, NULL),
(2, 9, 'remittance', NULL, 0.00, 'Versement en attente pour la commande n°34', 'confirmed', '2025-09-18 21:26:34', 1, NULL),
(3, 9, 'remittance', NULL, 10000.00, 'Versement en attente pour la commande n°33', 'confirmed', '2025-09-18 21:26:32', 1, NULL),
(4, 9, 'remittance', NULL, 3000.00, 'Versement en attente pour la commande n°34', 'confirmed', '2025-09-18 21:26:28', 1, NULL),
(5, 7, 'remittance', NULL, 20000.00, 'Versement en attente pour la commande n°35', 'confirmed', '2025-09-19 08:06:30', 1, '2025-09-19 08:29:20');

--
-- Déclencheurs `cash_transactions`
--
DELIMITER $$
CREATE TRIGGER `before_cash_transactions_insert` BEFORE INSERT ON `cash_transactions` FOR EACH ROW BEGIN
    IF NEW.type != 'remittance' THEN
        SET NEW.status = 'confirmed';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Structure de la table `debts`
--

CREATE TABLE `debts` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('packaging','storage','delivery_fee','other','expedition') NOT NULL,
  `status` enum('pending','paid') NOT NULL DEFAULT 'pending',
  `comment` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `settled_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `debts`
--

INSERT INTO `debts` (`id`, `shop_id`, `order_id`, `amount`, `type`, `status`, `comment`, `created_at`, `updated_at`, `created_by`, `updated_by`, `settled_at`) VALUES
(1, 2, NULL, 1000.00, '', 'paid', 'Report du solde négatif du 2025-09-16', '2025-09-15 23:00:00', '2025-09-18 16:25:01', NULL, 1, '2025-09-18 17:25:01'),
(2, 9, NULL, 2100.00, '', 'paid', 'Report du solde négatif du 2025-09-16', '2025-09-15 23:00:00', '2025-09-18 16:25:04', NULL, 1, '2025-09-18 17:25:04'),
(3, 2, NULL, 1000.00, '', 'paid', 'Report du solde négatif du 2025-09-16', '2025-09-15 23:00:00', '2025-09-18 16:25:08', NULL, 1, '2025-09-18 17:25:08'),
(4, 9, NULL, 2100.00, '', 'paid', 'Report du solde négatif du 2025-09-16', '2025-09-15 23:00:00', '2025-09-18 16:25:59', NULL, 1, '2025-09-18 17:25:59'),
(5, 5, NULL, 1050.00, '', 'pending', 'Report du solde négatif du 2025-09-16', '2025-09-15 23:00:00', '2025-09-17 13:46:35', NULL, NULL, NULL),
(6, 9, NULL, 2100.00, '', 'paid', 'Report du solde négatif du 2025-09-16', '2025-09-15 23:00:00', '2025-09-18 16:26:02', NULL, 1, '2025-09-18 17:26:02'),
(7, 9, 31, 2000.00, 'expedition', 'paid', 'Frais d\'expédition pour la commande n°31', '2025-09-17 13:48:30', '2025-09-18 16:24:44', NULL, 1, '2025-09-18 17:24:44'),
(8, 5, NULL, 1050.00, '', 'pending', 'Report du solde négatif du 2025-09-17', '2025-09-16 23:00:00', '2025-09-18 16:25:25', NULL, NULL, NULL),
(9, 9, NULL, 5250.00, '', 'paid', 'Report du solde négatif du 2025-09-17', '2025-09-16 23:00:00', '2025-09-18 16:25:56', NULL, 1, '2025-09-18 17:25:56'),
(10, 5, NULL, 100.00, '', 'pending', 'Frais de stockage pour le 2025-09-18', '2025-09-17 23:00:00', '2025-09-18 16:25:27', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Structure de la table `expenses`
--

CREATE TABLE `expenses` (
  `id` int(11) NOT NULL,
  `rider_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `comment` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `expense_categories`
--

CREATE TABLE `expense_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` enum('company_charge','deliveryman_charge') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `expense_categories`
--

INSERT INTO `expense_categories` (`id`, `name`, `type`) VALUES
(1, 'Loyer', 'company_charge'),
(2, 'Eau', 'company_charge'),
(3, 'Électricité', 'company_charge'),
(4, 'Fournitures de bureau', 'company_charge'),
(5, 'Carburant', 'deliveryman_charge'),
(6, 'Maintenance de moto', 'deliveryman_charge'),
(7, 'Taxi', 'deliveryman_charge'),
(8, 'Autre', 'deliveryman_charge');

-- --------------------------------------------------------

--
-- Structure de la table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `deliveryman_id` int(11) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `customer_phone` varchar(20) NOT NULL,
  `delivery_location` varchar(255) NOT NULL,
  `article_amount` decimal(10,2) NOT NULL,
  `delivery_fee` decimal(10,2) NOT NULL,
  `expedition_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','in_progress','delivered','cancelled','failed_delivery','reported') NOT NULL DEFAULT 'pending',
  `payment_status` enum('pending','cash','paid_to_supplier','cancelled') NOT NULL DEFAULT 'pending',
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `amount_received` decimal(10,2) DEFAULT 0.00,
  `debt_amount` decimal(10,2) DEFAULT 0.00,
  `updated_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `orders`
--

INSERT INTO `orders` (`id`, `shop_id`, `deliveryman_id`, `customer_name`, `customer_phone`, `delivery_location`, `article_amount`, `delivery_fee`, `expedition_fee`, `status`, `payment_status`, `created_by`, `created_at`, `updated_at`, `amount_received`, `debt_amount`, `updated_by`) VALUES
(16, 5, 7, NULL, '1234555', 'BASTOS', 10000.00, 1000.00, 0.00, 'delivered', 'cash', 1, '2025-09-14 02:02:17', '2025-09-14 02:17:00', 0.00, 0.00, 1),
(17, 5, 7, 'bardon', '65689390', 'simbock', 1000.00, 500.00, 0.00, 'delivered', 'cash', 1, '2025-09-14 02:03:40', '2025-09-14 02:19:14', 0.00, 0.00, 1),
(18, 7, 7, 'raté', '1234555', 'CJEKEL', 1000.00, 500.00, 0.00, 'failed_delivery', 'paid_to_supplier', 1, '2025-09-14 03:08:49', '2025-09-15 09:42:15', 0.00, 0.00, 1),
(19, 15, 9, 'test', '65689390', 'BASTOS', 10000.00, 1000.00, 0.00, 'delivered', 'cash', 1, '2025-09-14 18:39:41', '2025-09-14 18:55:57', 0.00, 0.00, 1),
(20, 16, NULL, NULL, '12345678', 'OBAM', 15000.00, 1000.00, 0.00, 'delivered', 'paid_to_supplier', 1, '2025-09-14 19:00:16', '2025-09-14 19:00:32', 0.00, 0.00, 1),
(21, 16, 7, 'livraison raté', '1234567890', 'livraison raté', 10000.00, 1000.00, 0.00, 'failed_delivery', 'paid_to_supplier', 1, '2025-09-15 11:06:02', '2025-09-15 11:07:59', 0.00, 0.00, 1),
(22, 16, 7, 'livraison MOMO', '123456789', 'livraison MOMO', 10000.00, 1000.00, 0.00, 'delivered', 'paid_to_supplier', 1, '2025-09-15 11:06:44', '2025-09-15 11:07:53', 0.00, 0.00, 1),
(23, 16, 7, 'livraison CASH', '123456789', 'livraison CSH', 10000.00, 1000.00, 0.00, 'delivered', 'cash', 1, '2025-09-15 11:07:01', '2025-09-15 11:07:49', 0.00, 0.00, 1),
(24, 16, 7, 'livraison R2', '123456789', 'livraison R2', 10000.00, 1000.00, 0.00, 'failed_delivery', 'cash', 1, '2025-09-15 11:07:23', '2025-09-15 11:07:43', 500.00, 0.00, 1),
(25, 16, 7, 'bardon', '123444444', 'BASTOS', 2000.00, 500.00, 0.00, 'delivered', 'cash', 1, '2025-09-15 11:13:29', '2025-09-15 11:13:41', 0.00, 0.00, 1),
(26, 16, 7, 'bardon', '1234555', 'ELIG EDZOA shell ', 0.00, 1000.00, 0.00, 'cancelled', 'cancelled', 1, '2025-09-15 08:54:00', '2025-09-16 13:38:33', 0.00, 0.00, 1),
(27, 9, 7, NULL, '1234555', 'BASTOS', 2000.00, 2000.00, 500.00, 'failed_delivery', 'paid_to_supplier', 1, '2025-09-16 13:58:00', '2025-09-16 22:52:44', 0.00, 0.00, 1),
(28, 5, 7, NULL, '1234555', 'BASTOS', 0.00, 1000.00, 2000.00, 'delivered', 'cash', 1, '2025-09-16 19:47:00', '2025-09-16 22:51:48', 0.00, 0.00, 1),
(29, 9, 7, 'bardon', '1234555', 'BASTOS', 1000.00, 1000.00, 0.00, 'delivered', 'cash', 1, '2025-09-16 20:41:00', '2025-09-16 22:51:48', 0.00, 0.00, 1),
(30, 2, 6, 'bardon', '1234555', 'bafia', 0.00, 1000.00, 2000.00, 'delivered', 'cash', 1, '2025-09-16 21:55:50', '2025-09-17 14:47:00', 0.00, 0.00, 1),
(31, 9, 9, NULL, '1234567', 'LOUM', 0.00, 1000.00, 2000.00, 'delivered', 'cash', 1, '2025-09-17 14:48:30', '2025-09-17 14:48:40', 0.00, 0.00, 1),
(33, 9, 9, 'bardon', '1234555', 'BASTOS', 10000.00, 1000.00, 0.00, 'delivered', 'cash', 1, '2025-09-18 19:56:57', '2025-09-18 20:56:58', 0.00, 0.00, 1),
(34, 9, 9, 'bardon', '1234555', 'BASTOS', 10000.00, 1000.00, 0.00, 'failed_delivery', 'cash', 1, '2025-09-18 19:56:00', '2025-09-18 20:57:08', 3000.00, 0.00, 1),
(35, 9, 7, 'bardon', '1234555', 'BASTOS', 20000.00, 1000.00, 0.00, 'delivered', 'cash', 1, '2025-09-19 08:06:18', '2025-09-19 08:06:30', 0.00, 0.00, 1);

-- --------------------------------------------------------

--
-- Structure de la table `order_history`
--

CREATE TABLE `order_history` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `action` varchar(255) NOT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `order_history`
--

INSERT INTO `order_history` (`id`, `order_id`, `action`, `details`, `user_id`, `created_at`) VALUES
(1, 16, 'Commande créée', NULL, 1, '2025-09-14 01:02:17'),
(2, 16, 'Commande assignée', NULL, 1, '2025-09-14 01:02:37'),
(3, 16, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:03:01'),
(4, 17, 'Commande créée', NULL, 1, '2025-09-14 01:03:40'),
(5, 17, 'Commande assignée', NULL, 1, '2025-09-14 01:03:45'),
(6, 16, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:04:02'),
(7, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:04:02'),
(8, 17, 'Statut changé en Annulé', NULL, 1, '2025-09-14 01:04:06'),
(9, 16, 'Statut changé en Annulé', NULL, 1, '2025-09-14 01:04:06'),
(10, 17, 'Statut changé en À relancer', NULL, 1, '2025-09-14 01:04:10'),
(11, 16, 'Statut changé en À relancer', NULL, 1, '2025-09-14 01:04:10'),
(12, 17, 'Commande assignée', NULL, 1, '2025-09-14 01:04:18'),
(13, 16, 'Commande assignée', NULL, 1, '2025-09-14 01:04:18'),
(14, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:04:23'),
(15, 16, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:04:23'),
(16, 17, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-14 01:12:49'),
(17, 17, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-14 01:14:55'),
(18, 16, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-14 01:14:55'),
(19, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:15:42'),
(20, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:15:46'),
(21, 17, 'Statut changé en Livraison ratée (Montant perçu: 0 FCFA)', NULL, 1, '2025-09-14 01:15:53'),
(22, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:16:18'),
(23, 17, 'Statut changé en Livraison ratée (Montant perçu: 1000 FCFA)', NULL, 1, '2025-09-14 01:16:35'),
(24, 17, 'Statut changé en À relancer', NULL, 1, '2025-09-14 01:16:37'),
(25, 17, 'Statut changé en Annulé', NULL, 1, '2025-09-14 01:16:39'),
(26, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:17:00'),
(27, 16, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:17:00'),
(28, 17, 'Statut changé en Livraison ratée (Montant perçu: 0 FCFA)', NULL, 1, '2025-09-14 01:18:40'),
(29, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:18:44'),
(30, 17, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-14 01:18:51'),
(31, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:18:58'),
(32, 17, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-14 01:19:10'),
(33, 17, 'Statut changé en Livré', NULL, 1, '2025-09-14 01:19:14'),
(34, 18, 'Commande créée', NULL, 1, '2025-09-14 02:08:49'),
(35, 18, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-14 02:09:01'),
(36, 18, 'Statut changé en Livraison ratée (Montant perçu: 0 FCFA)', NULL, 1, '2025-09-14 02:09:05'),
(37, 19, 'Commande créée', NULL, 1, '2025-09-14 17:39:41'),
(38, 19, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-14 17:55:38'),
(39, 19, 'Statut changé en Livré', NULL, 1, '2025-09-14 17:55:57'),
(40, 20, 'Commande créée', NULL, 1, '2025-09-14 18:00:16'),
(41, 20, 'Statut changé en Livré', NULL, 1, '2025-09-14 18:00:32'),
(42, 18, 'Statut changé en Livraison ratée (Montant perçu: 500 FCFA)', NULL, 1, '2025-09-14 21:07:39'),
(43, 18, 'Statut changé en Livraison ratée (Montant perçu: 0 FCFA)', NULL, 1, '2025-09-15 08:42:15'),
(44, 21, 'Commande créée', NULL, 1, '2025-09-15 10:06:02'),
(45, 22, 'Commande créée', NULL, 1, '2025-09-15 10:06:44'),
(46, 23, 'Commande créée', NULL, 1, '2025-09-15 10:07:01'),
(47, 24, 'Commande créée', NULL, 1, '2025-09-15 10:07:23'),
(48, 24, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-15 10:07:31'),
(49, 23, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-15 10:07:31'),
(50, 22, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-15 10:07:31'),
(51, 21, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-15 10:07:31'),
(52, 24, 'Statut changé en Livraison ratée (Montant perçu: 500 FCFA)', NULL, 1, '2025-09-15 10:07:43'),
(53, 23, 'Statut changé en Livré', NULL, 1, '2025-09-15 10:07:49'),
(54, 22, 'Statut changé en Livré', NULL, 1, '2025-09-15 10:07:53'),
(55, 21, 'Statut changé en Livraison ratée (Montant perçu: 0 FCFA)', NULL, 1, '2025-09-15 10:07:59'),
(56, 25, 'Commande créée', NULL, 1, '2025-09-15 10:13:29'),
(57, 25, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-15 10:13:37'),
(58, 25, 'Statut changé en Livré', NULL, 1, '2025-09-15 10:13:41'),
(59, 26, 'Commande créée', NULL, 1, '2025-09-16 08:54:05'),
(60, 26, 'Statut changé en Livré', NULL, 1, '2025-09-16 08:54:09'),
(61, 26, 'Statut changé en Annulé', NULL, 1, '2025-09-16 11:16:17'),
(62, 26, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-16 11:17:02'),
(63, 26, 'Statut changé en Annulé', NULL, 1, '2025-09-16 11:17:04'),
(64, 26, 'Mise à jour de la commande', NULL, 1, '2025-09-16 12:38:33'),
(65, 27, 'Commande créée', NULL, 1, '2025-09-16 13:58:18'),
(66, 27, 'Mise à jour de la commande', NULL, 1, '2025-09-16 14:05:44'),
(67, 27, 'Statut changé en Livré', NULL, 1, '2025-09-16 19:45:23'),
(68, 28, 'Commande créée', NULL, 1, '2025-09-16 19:47:30'),
(69, 28, 'Statut changé en Livré', NULL, 1, '2025-09-16 20:15:39'),
(70, 28, 'Mise à jour de la commande', NULL, 1, '2025-09-16 20:23:33'),
(71, 28, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-16 20:36:37'),
(72, 29, 'Commande créée', NULL, 1, '2025-09-16 20:41:22'),
(73, 29, 'Mise à jour de la commande', NULL, 1, '2025-09-16 20:53:09'),
(74, 29, 'Statut changé en Livré', NULL, 1, '2025-09-16 20:53:17'),
(75, 30, 'Commande créée', NULL, 1, '2025-09-16 20:55:50'),
(76, 30, 'Statut changé en Livré', NULL, 1, '2025-09-16 20:55:56'),
(77, 30, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-16 21:28:12'),
(78, 30, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-16 21:28:52'),
(79, 29, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-16 21:28:52'),
(80, 28, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-16 21:28:52'),
(81, 27, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-16 21:28:52'),
(82, 30, 'Statut changé en Livré', NULL, 1, '2025-09-16 21:29:02'),
(83, 30, 'Statut changé en Livraison ratée (Montant perçu: 1000 FCFA)', NULL, 1, '2025-09-16 21:29:11'),
(84, 29, 'Statut changé en Livré', NULL, 1, '2025-09-16 21:51:48'),
(85, 28, 'Statut changé en Livré', NULL, 1, '2025-09-16 21:51:48'),
(86, 27, 'Statut changé en Livré', NULL, 1, '2025-09-16 21:51:48'),
(87, 30, 'Statut changé en Annulé', NULL, 1, '2025-09-16 21:52:06'),
(88, 30, 'Statut changé en Livré', NULL, 1, '2025-09-16 21:52:08'),
(89, 27, 'Statut changé en Livraison ratée (Montant perçu: 0 FCFA)', NULL, 1, '2025-09-16 21:52:44'),
(90, 30, 'Statut changé en Livré', NULL, 1, '2025-09-17 10:20:57'),
(91, 30, 'Statut changé en Livraison ratée (Montant perçu: 0 FCFA)', NULL, 1, '2025-09-17 10:21:04'),
(92, 30, 'Commande assignée au livreur : junior', NULL, 1, '2025-09-17 11:36:40'),
(93, 30, 'Statut changé en Livré', NULL, 1, '2025-09-17 13:47:00'),
(94, 31, 'Commande créée', NULL, 1, '2025-09-17 13:48:30'),
(95, 31, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-17 13:48:36'),
(96, 31, 'Statut changé en Livré', NULL, 1, '2025-09-17 13:48:40'),
(108, 33, 'Commande créée', NULL, 1, '2025-09-18 18:56:57'),
(109, 33, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-18 18:57:03'),
(110, 33, 'Statut changé en Livré', NULL, 1, '2025-09-18 18:57:06'),
(111, 33, 'Commande assignée au livreur : orange', NULL, 1, '2025-09-18 19:04:04'),
(112, 33, 'Statut changé en Livré', NULL, 1, '2025-09-18 19:04:07'),
(113, 33, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-18 19:51:30'),
(114, 33, 'Statut changé en Livré', NULL, 1, '2025-09-18 19:51:33'),
(115, 34, 'Commande créée', NULL, 1, '2025-09-18 19:56:24'),
(116, 33, 'Statut changé en À relancer', NULL, 1, '2025-09-18 19:56:27'),
(117, 34, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-18 19:56:37'),
(118, 33, 'Commande assignée au livreur : TONTON', NULL, 1, '2025-09-18 19:56:37'),
(119, 34, 'Statut changé en Livré', NULL, 1, '2025-09-18 19:56:41'),
(120, 34, 'Mise à jour de la commande', NULL, 1, '2025-09-18 19:56:56'),
(121, 33, 'Statut changé en Livré', NULL, 1, '2025-09-18 19:56:58'),
(122, 34, 'Statut changé en Livraison ratée (Montant perçu: 3000 FCFA)', NULL, 1, '2025-09-18 19:57:08'),
(123, 35, 'Commande créée', NULL, 1, '2025-09-19 07:06:18'),
(124, 35, 'Commande assignée au livreur : bardon junior', NULL, 1, '2025-09-19 07:06:24'),
(125, 35, 'Statut changé en Livré', NULL, 1, '2025-09-19 07:06:30');

-- --------------------------------------------------------

--
-- Structure de la table `order_items`
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `order_items`
--

INSERT INTO `order_items` (`id`, `order_id`, `item_name`, `quantity`, `amount`) VALUES
(1, 16, 'SAC', 1, 10000.00),
(2, 17, 'SAC', 1, 1000.00),
(3, 18, 'CJEJ', 1, 1000.00),
(4, 19, 'SAC', 1, 10000.00),
(5, 20, 'P.gaz', 1, 15000.00),
(6, 21, 'SAC', 1, 10000.00),
(7, 22, 'livraison MOMO', 1, 10000.00),
(8, 23, 'livraison MOMO', 1, 10000.00),
(9, 24, 'livraison MOMO', 1, 10000.00),
(10, 25, 'OK', 1, 1000.00),
(11, 25, 'OK 2', 1, 1000.00),
(13, 26, 'SAC', 1, 0.00),
(15, 27, 'SAC', 1, 2000.00),
(17, 28, 'SAC', 1, 0.00),
(19, 29, 'SAC', 1, 1000.00),
(20, 30, 'SAC', 1, 0.00),
(21, 31, 'LOUM', 1, 0.00),
(23, 33, 'SAC', 1, 10000.00),
(25, 34, 'SAC', 1, 10000.00),
(26, 35, 'SAC', 1, 20000.00);

-- --------------------------------------------------------

--
-- Structure de la table `remittances`
--

CREATE TABLE `remittances` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_date` date NOT NULL,
  `payment_operator` enum('Orange Money','MTN Mobile Money') NOT NULL,
  `status` enum('paid','partially_paid','failed') NOT NULL,
  `transaction_id` varchar(255) DEFAULT NULL,
  `comment` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `user_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `remittances`
--

INSERT INTO `remittances` (`id`, `shop_id`, `amount`, `payment_date`, `payment_operator`, `status`, `transaction_id`, `comment`, `created_at`, `updated_at`, `user_id`) VALUES
(1, 5, 6200.00, '2025-09-17', 'Orange Money', 'paid', NULL, NULL, '2025-09-16 23:22:39', '2025-09-16 23:22:39', 1),
(2, 5, 2300.00, '2025-09-17', 'Orange Money', 'paid', NULL, NULL, '2025-09-16 23:23:00', '2025-09-16 23:23:00', 1),
(3, 15, 9000.00, '2025-09-17', 'MTN Mobile Money', 'paid', NULL, NULL, '2025-09-16 23:23:28', '2025-09-16 23:23:28', 1);

-- --------------------------------------------------------

--
-- Structure de la table `remittance_orders`
--

CREATE TABLE `remittance_orders` (
  `remittance_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `shops`
--

CREATE TABLE `shops` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `payment_name` varchar(255) DEFAULT NULL,
  `phone_number` varchar(20) NOT NULL,
  `phone_number_for_payment` varchar(20) DEFAULT NULL,
  `payment_operator` enum('Orange Money','MTN Mobile Money') DEFAULT NULL,
  `bill_packaging` tinyint(1) NOT NULL DEFAULT 0,
  `bill_storage` tinyint(1) NOT NULL DEFAULT 0,
  `packaging_price` decimal(10,2) NOT NULL DEFAULT 50.00,
  `storage_price` decimal(10,2) NOT NULL DEFAULT 100.00,
  `status` enum('actif','inactif') NOT NULL DEFAULT 'actif',
  `created_by` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `shops`
--

INSERT INTO `shops` (`id`, `name`, `payment_name`, `phone_number`, `phone_number_for_payment`, `payment_operator`, `bill_packaging`, `bill_storage`, `packaging_price`, `storage_price`, `status`, `created_by`, `created_at`) VALUES
(1, 'clasolde', 'kouemo bardon', '656029845', '690484981', 'Orange Money', 1, 0, 50.00, 100.00, 'actif', 1, '2025-09-08 08:03:28'),
(2, 'Boutique du Coin', NULL, '670123456', NULL, NULL, 0, 0, 50.00, 100.00, 'actif', 1, '2025-09-08 09:07:49'),
(4, 'erika', NULL, '38494443', NULL, NULL, 1, 0, 50.00, 100.00, 'inactif', 1, '2025-09-08 10:28:13'),
(5, 'ana', 'ka', '6563904', '12345678', 'Orange Money', 1, 1, 50.00, 100.00, 'actif', 1, '2025-09-09 21:02:23'),
(6, 'dkk', NULL, '23456789', NULL, NULL, 0, 0, 50.00, 100.00, 'inactif', 1, '2025-09-09 21:21:06'),
(7, 'dkt', NULL, '23783920', NULL, NULL, 1, 0, 50.00, 100.00, 'actif', 1, '2025-09-09 21:32:02'),
(8, 'pagnol shop', NULL, '656399403', NULL, NULL, 1, 1, 50.00, 100.00, 'inactif', 1, '2025-09-09 23:51:07'),
(9, 'bardon', NULL, '65789344', NULL, NULL, 1, 0, 50.00, 100.00, 'actif', 1, '2025-09-10 02:30:53'),
(12, 'flore shop', NULL, '67849030', NULL, NULL, 0, 0, 50.00, 100.00, 'inactif', 1, '2025-09-10 11:36:19'),
(13, 'EMMA', NULL, '656093040', NULL, NULL, 1, 0, 50.00, 200.00, 'actif', 1, '2025-09-10 12:54:00'),
(14, 'IDENNE', NULL, '7638438', NULL, NULL, 1, 1, 50.00, 200.00, 'inactif', 1, '2025-09-10 15:09:54'),
(15, 'Dreta store', 'BBB', '656098484', '123456', 'MTN Mobile Money', 1, 0, 50.00, 500.00, 'actif', 1, '2025-09-11 08:13:44'),
(16, 'KESTER SHOP', '', '123456789', '', 'MTN Mobile Money', 1, 0, 50.00, 100.00, 'actif', 1, '2025-09-14 18:59:17'),
(17, 'TEST', NULL, '12345678', NULL, NULL, 0, 0, 50.00, 100.00, 'actif', 1, '2025-09-17 17:28:06');

-- --------------------------------------------------------

--
-- Structure de la table `shop_storage_history`
--

CREATE TABLE `shop_storage_history` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `phone_number` varchar(20) NOT NULL,
  `pin` varchar(255) NOT NULL,
  `role` enum('admin','livreur') NOT NULL,
  `status` enum('actif','inactif') NOT NULL DEFAULT 'actif',
  `name` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `users`
--

INSERT INTO `users` (`id`, `phone_number`, `pin`, `role`, `status`, `name`, `created_at`, `updated_at`) VALUES
(1, '690484981', '0000', 'admin', 'actif', 'Karden', '2025-09-08 08:02:07', '2025-09-09 20:24:15'),
(6, '656029845', '0000', 'livreur', 'actif', 'junior', '2025-09-09 20:08:37', '2025-09-18 01:22:29'),
(7, '6893903', '1111', 'livreur', 'actif', 'bardon junior', '2025-09-09 22:25:13', '2025-09-13 10:44:49'),
(8, '65739022', '1234', 'admin', 'actif', 'aloys', '2025-09-09 23:35:49', '2025-09-15 13:06:45'),
(9, '083003', '1234', 'livreur', 'actif', 'TONTON', '2025-09-09 23:36:12', '2025-09-13 10:44:51'),
(10, '790243', '1234', 'livreur', 'actif', 'ejfe', '2025-09-10 00:25:12', '2025-09-13 10:44:53'),
(11, '0876534567', '1111', 'livreur', 'actif', 'orange', '2025-09-10 00:58:13', '2025-09-13 10:44:55'),
(12, '8390330', '1234', 'admin', 'actif', 'MTN', '2025-09-10 11:36:54', '2025-09-10 11:36:54'),
(13, '648394', '1234', 'admin', 'actif', 'EMMA', '2025-09-10 12:54:57', '2025-09-10 12:54:57');

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `cash_transactions`
--
ALTER TABLE `cash_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `validated_by` (`validated_by`),
  ADD KEY `category_id` (`category_id`);

--
-- Index pour la table `debts`
--
ALTER TABLE `debts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `idx_debt_shop` (`shop_id`),
  ADD KEY `idx_debt_status` (`status`),
  ADD KEY `idx_debt_created_at` (`created_at`),
  ADD KEY `idx_debt_type_date` (`type`,`created_at`);

--
-- Index pour la table `expenses`
--
ALTER TABLE `expenses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `rider_id` (`rider_id`);

--
-- Index pour la table `expense_categories`
--
ALTER TABLE `expense_categories`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `shop_id` (`shop_id`),
  ADD KEY `deliveryman_id` (`deliveryman_id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `updated_by` (`updated_by`);

--
-- Index pour la table `order_history`
--
ALTER TABLE `order_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Index pour la table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`);

--
-- Index pour la table `remittances`
--
ALTER TABLE `remittances`
  ADD PRIMARY KEY (`id`),
  ADD KEY `shop_id` (`shop_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Index pour la table `remittance_orders`
--
ALTER TABLE `remittance_orders`
  ADD PRIMARY KEY (`remittance_id`,`order_id`),
  ADD KEY `order_id` (`order_id`);

--
-- Index pour la table `shops`
--
ALTER TABLE `shops`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_shops_name` (`name`),
  ADD KEY `idx_shops_phone_number` (`phone_number`),
  ADD KEY `idx_shops_created_by` (`created_by`);

--
-- Index pour la table `shop_storage_history`
--
ALTER TABLE `shop_storage_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `shop_id` (`shop_id`);

--
-- Index pour la table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `phone_number` (`phone_number`),
  ADD KEY `idx_users_phone_number` (`phone_number`),
  ADD KEY `idx_users_role` (`role`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `cash_transactions`
--
ALTER TABLE `cash_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT pour la table `debts`
--
ALTER TABLE `debts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT pour la table `expenses`
--
ALTER TABLE `expenses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `expense_categories`
--
ALTER TABLE `expense_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT pour la table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=36;

--
-- AUTO_INCREMENT pour la table `order_history`
--
ALTER TABLE `order_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=126;

--
-- AUTO_INCREMENT pour la table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT pour la table `remittances`
--
ALTER TABLE `remittances`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT pour la table `shops`
--
ALTER TABLE `shops`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT pour la table `shop_storage_history`
--
ALTER TABLE `shop_storage_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- Contraintes pour les tables déchargées
--

--
-- Contraintes pour la table `cash_transactions`
--
ALTER TABLE `cash_transactions`
  ADD CONSTRAINT `cash_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `cash_transactions_ibfk_2` FOREIGN KEY (`validated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `cash_transactions_ibfk_3` FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`id`);

--
-- Contraintes pour la table `debts`
--
ALTER TABLE `debts`
  ADD CONSTRAINT `debts_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `debts_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `expenses`
--
ALTER TABLE `expenses`
  ADD CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`deliveryman_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `orders_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `order_history`
--
ALTER TABLE `order_history`
  ADD CONSTRAINT `order_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `order_history_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `remittances`
--
ALTER TABLE `remittances`
  ADD CONSTRAINT `remittances_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `remittances_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `remittance_orders`
--
ALTER TABLE `remittance_orders`
  ADD CONSTRAINT `remittance_orders_ibfk_1` FOREIGN KEY (`remittance_id`) REFERENCES `remittances` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `remittance_orders_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `shops`
--
ALTER TABLE `shops`
  ADD CONSTRAINT `shops_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Contraintes pour la table `shop_storage_history`
--
ALTER TABLE `shop_storage_history`
  ADD CONSTRAINT `shop_storage_history_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
